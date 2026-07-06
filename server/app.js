const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { openDb, getSettings, setSettings } = require('./db');
const { createBrowserPool } = require('./browser');
const {
  normalizeParams, cacheHash, capture, imageDimensions, ParamError, CONTENT_TYPES
} = require('./screenshot');

const GLOBAL_RATE_PER_MIN = 600; // global safety cap across all keys

function createApp(opts = {}) {
  const dbPath = opts.dbPath || process.env.DB_PATH || path.join(__dirname, '..', 'data', 'snapfleet.db');
  const shotsDir = opts.shotsDir || process.env.SHOTS_DIR || path.join(__dirname, '..', 'data', 'shots');
  const adminPassword = opts.adminPassword || process.env.ADMIN_PASSWORD || 'admin';
  const autologinToken = opts.autologinToken || process.env.AUTOLOGIN_TOKEN || null;
  const allowPrivate = String(opts.allowPrivate ?? process.env.ALLOW_PRIVATE ?? 'true') !== 'false';

  fs.mkdirSync(shotsDir, { recursive: true });
  const db = openDb(dbPath);
  const pool = createBrowserPool({
    maxConcurrent: opts.maxConcurrent || process.env.MAX_CONCURRENT || 2,
    puppeteerArgs: process.env.PUPPETEER_ARGS || '',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ---------------- sessions (admin UI) ----------------
  function newSession(res) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (token) VALUES (?)').run(token);
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
    return token;
  }
  function hasSession(req) {
    const t = req.cookies.sid;
    if (!t) return false;
    return !!db.prepare('SELECT 1 FROM sessions WHERE token = ?').get(t);
  }
  function requireAuth(req, res, next) {
    if (hasSession(req)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  }

  app.post('/api/login', (req, res) => {
    const pw = String(req.body?.password || '');
    if (pw !== adminPassword) return res.status(401).json({ error: 'Wrong password' });
    newSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies.sid);
    res.clearCookie('sid');
    res.json({ ok: true });
  });

  // Desktop mode auto-login (token minted by electron/main.js)
  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) newSession(res);
    res.redirect('/');
  });

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      browser: pool.status(),
      active_jobs: pool.activeCount,
      queued_jobs: pool.queueLength,
      version: require('../package.json').version
    });
  });

  // ---------------- API keys ----------------
  const buckets = new Map(); // keyId -> { tokens, capacity, updatedAt }
  const globalBucket = { tokens: GLOBAL_RATE_PER_MIN, updatedAt: Date.now() };

  function takeToken(bucket, capacity) {
    const now = Date.now();
    const refill = ((now - bucket.updatedAt) / 60_000) * capacity;
    bucket.tokens = Math.min(capacity, bucket.tokens + refill);
    bucket.updatedAt = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true };
    }
    const retryAfter = Math.ceil(((1 - bucket.tokens) * 60_000) / capacity / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // Resolve + gate the API key for /api/v1/screenshot.
  // Returns key row or sends the error response and returns null.
  function gateApiKey(req, res) {
    const raw = String(req.query.key || req.headers['x-api-key'] || (req.body && req.body.key) || '');
    if (!raw) {
      res.status(401).json({ error: 'Missing API key (use ?key= or X-Api-Key header)' });
      return null;
    }
    const key = db.prepare('SELECT * FROM api_keys WHERE key = ?').get(raw);
    if (!key || key.revoked) {
      res.status(401).json({ error: 'Invalid or revoked API key' });
      return null;
    }
    // daily quota
    if (key.today_date !== today()) {
      db.prepare('UPDATE api_keys SET requests_today = 0, today_date = ? WHERE id = ?').run(today(), key.id);
      key.requests_today = 0;
    }
    if (key.daily_quota > 0 && key.requests_today >= key.daily_quota) {
      res.set('Retry-After', '3600');
      res.status(429).json({ error: 'Daily quota exceeded' });
      return null;
    }
    // per-key token bucket
    let bucket = buckets.get(key.id);
    if (!bucket || bucket.capacity !== key.rate_per_min) {
      bucket = { tokens: key.rate_per_min, capacity: key.rate_per_min, updatedAt: Date.now() };
      buckets.set(key.id, bucket);
    }
    const per = takeToken(bucket, key.rate_per_min);
    if (!per.ok) {
      res.set('Retry-After', String(per.retryAfter));
      res.status(429).json({ error: 'Rate limit exceeded' });
      return null;
    }
    // global safety cap
    const glob = takeToken(globalBucket, GLOBAL_RATE_PER_MIN);
    if (!glob.ok) {
      res.set('Retry-After', String(glob.retryAfter));
      res.status(429).json({ error: 'Server is at global capacity' });
      return null;
    }
    return key;
  }

  function logUsage(keyId, cacheHit, statusCode, tookMs) {
    db.prepare('INSERT INTO usage_log (api_key_id, cache_hit, status_code, took_ms) VALUES (?, ?, ?, ?)')
      .run(keyId, cacheHit ? 1 : 0, statusCode, tookMs);
    if (statusCode < 500) {
      db.prepare('UPDATE api_keys SET requests_total = requests_total + 1, requests_today = requests_today + 1 WHERE id = ?')
        .run(keyId);
    }
  }

  // ---------------- the screenshot endpoint ----------------
  function extFor(format) {
    return format === 'jpg' ? 'jpg' : format === 'pdf' ? 'pdf' : 'png';
  }

  async function renderAndStore({ params, ttl, keyId, hash }) {
    const started = Date.now();
    const buf = await pool.withPage((page) => capture(page, params));
    const tookMs = Date.now() - started;
    const filePath = path.join(shotsDir, `${hash}.${extFor(params.format)}`);
    fs.writeFileSync(filePath, buf);
    const dims = params.format === 'pdf' ? { width: 0, height: 0 } : imageDimensions(buf, params.format);
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    db.prepare(`
      INSERT INTO shots (cache_hash, url, params_json, format, file_path, size_bytes, width, height, status, error, api_key_id, took_ms, expires_at)
      VALUES (@cache_hash, @url, @params_json, @format, @file_path, @size_bytes, @width, @height, 'ok', NULL, @api_key_id, @took_ms, @expires_at)
      ON CONFLICT(cache_hash) DO UPDATE SET
        file_path = excluded.file_path, size_bytes = excluded.size_bytes,
        width = excluded.width, height = excluded.height, status = 'ok', error = NULL,
        took_ms = excluded.took_ms, expires_at = excluded.expires_at, created_at = datetime('now')
    `).run({
      cache_hash: hash,
      url: params.url,
      params_json: JSON.stringify(params),
      format: params.format,
      file_path: filePath,
      size_bytes: buf.length,
      width: dims.width,
      height: dims.height,
      api_key_id: keyId,
      took_ms: tookMs,
      expires_at: expiresAt
    });
    return { buf, tookMs };
  }

  async function handleScreenshot(req, res) {
    const raw = req.method === 'POST' ? { ...req.query, ...(req.body || {}) } : req.query;
    const key = gateApiKey(req, res);
    if (!key) return;

    const started = Date.now();
    let normalized;
    try {
      normalized = normalizeParams(raw, { defaults: getSettings(db), allowPrivate });
    } catch (e) {
      if (e instanceof ParamError) {
        logUsage(key.id, false, 400, 0);
        return res.status(400).json({ error: e.message });
      }
      throw e;
    }
    const { params, fresh, ttl } = normalized;
    const hash = cacheHash(params);

    // cache lookup
    if (!fresh) {
      const row = db.prepare("SELECT * FROM shots WHERE cache_hash = ? AND status = 'ok'").get(hash);
      if (row && row.expires_at > new Date().toISOString() && fs.existsSync(row.file_path)) {
        logUsage(key.id, true, 200, Date.now() - started);
        res.set('X-Snapfleet-Cache', 'HIT');
        res.type(CONTENT_TYPES[params.format]);
        return res.send(fs.readFileSync(row.file_path));
      }
    }

    try {
      const { buf } = await renderAndStore({ params, ttl, keyId: key.id, hash });
      logUsage(key.id, false, 200, Date.now() - started);
      res.set('X-Snapfleet-Cache', 'MISS');
      res.type(CONTENT_TYPES[params.format]);
      res.send(buf);
    } catch (e) {
      const status = e instanceof ParamError ? 400 : 500;
      logUsage(key.id, false, status, Date.now() - started);
      db.prepare(`
        INSERT INTO shots (cache_hash, url, params_json, format, status, error, api_key_id, took_ms, expires_at)
        VALUES (?, ?, ?, ?, 'error', ?, ?, ?, datetime('now'))
        ON CONFLICT(cache_hash) DO UPDATE SET status = 'error', error = excluded.error, created_at = datetime('now')
      `).run(hash, params.url, JSON.stringify(params), params.format, String(e.message || e), key.id, Date.now() - started);
      res.status(status).json({ error: String(e.message || e) });
    }
  }

  app.get('/api/v1/screenshot', handleScreenshot);
  app.post('/api/v1/screenshot', handleScreenshot);

  // ---------------- admin: API keys ----------------
  app.get('/api/keys', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM api_keys ORDER BY id DESC').all());
  });

  app.post('/api/keys', requireAuth, (req, res) => {
    const name = String(req.body?.name || '').trim() || 'Unnamed key';
    const key = 'sf_' + crypto.randomBytes(16).toString('hex');
    const rate = Math.max(1, Number(req.body?.rate_per_min) || 60);
    const quota = Math.max(0, Number(req.body?.daily_quota) || 0);
    const info = db.prepare(
      'INSERT INTO api_keys (name, key, rate_per_min, daily_quota, today_date) VALUES (?, ?, ?, ?, ?)'
    ).run(name, key, rate, quota, today());
    res.status(201).json(db.prepare('SELECT * FROM api_keys WHERE id = ?').get(info.lastInsertRowid));
  });

  app.put('/api/keys/:id', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : row.name;
    const rate = req.body?.rate_per_min !== undefined ? Math.max(1, Number(req.body.rate_per_min) || 1) : row.rate_per_min;
    const quota = req.body?.daily_quota !== undefined ? Math.max(0, Number(req.body.daily_quota) || 0) : row.daily_quota;
    const revoked = req.body?.revoked !== undefined ? (req.body.revoked ? 1 : 0) : row.revoked;
    db.prepare('UPDATE api_keys SET name = ?, rate_per_min = ?, daily_quota = ?, revoked = ? WHERE id = ?')
      .run(name, rate, quota, revoked, row.id);
    buckets.delete(row.id); // re-seed bucket with new rate
    res.json(db.prepare('SELECT * FROM api_keys WHERE id = ?').get(row.id));
  });

  app.delete('/api/keys/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
    buckets.delete(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/keys/:id/regenerate', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const key = 'sf_' + crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE api_keys SET key = ?, revoked = 0 WHERE id = ?').run(key, row.id);
    res.json(db.prepare('SELECT * FROM api_keys WHERE id = ?').get(row.id));
  });

  // ---------------- admin: gallery ----------------
  app.get('/api/shots', requireAuth, (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const q = String(req.query.q || '').trim();
    const now = new Date().toISOString();
    const rows = q
      ? db.prepare('SELECT * FROM shots WHERE url LIKE ? ORDER BY created_at DESC, id DESC LIMIT ?').all(`%${q}%`, limit)
      : db.prepare('SELECT * FROM shots ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
    res.json(rows.map((r) => ({
      ...r,
      cached: r.status === 'ok' && r.expires_at > now && fs.existsSync(r.file_path)
    })));
  });

  app.get('/api/shots/:id/file', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM shots WHERE id = ?').get(req.params.id);
    if (!row || row.status !== 'ok' || !fs.existsSync(row.file_path)) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.type(CONTENT_TYPES[row.format] || 'application/octet-stream');
    res.send(fs.readFileSync(row.file_path));
  });

  app.delete('/api/shots/:id', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM shots WHERE id = ?').get(req.params.id);
    if (row) {
      try { if (row.file_path && fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path); } catch { /* ignore */ }
      db.prepare('DELETE FROM shots WHERE id = ?').run(row.id);
    }
    res.json({ ok: true });
  });

  app.post('/api/shots/:id/retake', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT * FROM shots WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    try {
      const params = JSON.parse(row.params_json);
      const ttl = Number(getSettings(db).default_ttl_seconds) || 86400;
      await renderAndStore({ params, ttl, keyId: row.api_key_id, hash: row.cache_hash });
      res.json(db.prepare('SELECT * FROM shots WHERE id = ?').get(row.id));
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // ---------------- admin: stats / settings / cache ----------------
  app.get('/api/stats', requireAuth, (req, res) => {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const totals = db.prepare(`
      SELECT COUNT(*) AS requests, SUM(cache_hit) AS hits, AVG(CASE WHEN cache_hit = 0 AND status_code = 200 THEN took_ms END) AS avg_render_ms
      FROM usage_log WHERE created_at >= ?
    `).get(dayAgo.replace('T', ' ').slice(0, 19));
    const hourly = db.prepare(`
      SELECT strftime('%Y-%m-%dT%H:00', created_at) AS hour, COUNT(*) AS requests, SUM(cache_hit) AS hits
      FROM usage_log WHERE created_at >= ? GROUP BY hour ORDER BY hour
    `).all(dayAgo.replace('T', ' ').slice(0, 19));
    const shotCount = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes),0) AS bytes FROM shots').get();
    res.json({
      requests_24h: totals.requests || 0,
      cache_hit_rate: totals.requests ? (totals.hits || 0) / totals.requests : 0,
      avg_render_ms: Math.round(totals.avg_render_ms || 0),
      shots_stored: shotCount.n,
      bytes_stored: shotCount.bytes,
      browser: pool.status(),
      hourly
    });
  });

  app.get('/api/settings', requireAuth, (req, res) => {
    res.json({ ...getSettings(db), allow_private: allowPrivate });
  });

  app.put('/api/settings', requireAuth, (req, res) => {
    setSettings(db, req.body || {});
    res.json({ ...getSettings(db), allow_private: allowPrivate });
  });

  app.post('/api/cache/clear', requireAuth, (req, res) => {
    const rows = db.prepare("SELECT id, file_path FROM shots WHERE status = 'ok'").all();
    let removed = 0;
    for (const r of rows) {
      try { if (r.file_path && fs.existsSync(r.file_path)) { fs.unlinkSync(r.file_path); removed += 1; } } catch { /* ignore */ }
    }
    db.prepare('DELETE FROM shots').run();
    res.json({ ok: true, removed });
  });

  // ---------------- cache sweep (hourly) ----------------
  function sweepExpired() {
    const now = new Date().toISOString();
    const rows = db.prepare("SELECT id, file_path FROM shots WHERE expires_at < ? AND status = 'ok'").all(now);
    for (const r of rows) {
      try { if (r.file_path && fs.existsSync(r.file_path)) fs.unlinkSync(r.file_path); } catch { /* ignore */ }
    }
    // keep the rows for the gallery history, but prune old usage logs
    db.prepare("DELETE FROM usage_log WHERE created_at < datetime('now', '-30 days')").run();
  }
  const sweepTimer = setInterval(sweepExpired, 3600 * 1000);
  sweepTimer.unref();

  // ---------------- static frontend ----------------
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/|auth\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // graceful shutdown hook: closes ONLY our own Puppeteer browser + DB
  app.locals.shutdown = async () => {
    clearInterval(sweepTimer);
    await pool.shutdown();
    db.close();
  };
  app.locals.db = db;
  app.locals.pool = pool;

  return app;
}

module.exports = { createApp };
