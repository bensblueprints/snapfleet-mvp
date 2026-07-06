// Snapfleet smoke test — spawns the real server, renders REAL screenshots
// against a local target page, and asserts on the actual bytes.
// NOTE: first `npm i` is slow because puppeteer downloads Chromium (~170MB).
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const Database = require('better-sqlite3');

const SERVER_PORT = 5395;
const TARGET_PORT = 5396;
const BASE = `http://127.0.0.1:${SERVER_PORT}`;
const ADMIN_PASSWORD = 'smoke-test-pw';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snapfleet-smoke-'));
const dbPath = path.join(tmpRoot, 'test.db');
const shotsDir = path.join(tmpRoot, 'shots');

let serverProc = null;
let targetServer = null;
let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}`);
  }
}

// ---- tiny HTTP client (keeps binary bodies intact) ----
function request(method, url, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const get = (url, headers) => request('GET', url, { headers });
function postJson(url, obj, headers = {}) {
  const body = JSON.stringify(obj);
  return request('POST', url, {
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    body
  });
}

function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function waitFor(fn, ms = 60_000, step = 300) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
}

// ---- local target page: #hero div + prefers-color-scheme CSS ----
const TARGET_HTML = `<!doctype html><html><head><title>Snapfleet Target</title>
<style>
  body { margin: 0; background: #ffffff; color: #111; font: 16px sans-serif; }
  @media (prefers-color-scheme: dark) { body { background: #000000; color: #eee; } }
  #hero { width: 400px; height: 200px; background: #7c3aed; color: #fff; padding: 8px; }
</style></head>
<body><h1>Snapfleet smoke target</h1><div id="hero">Hero block</div><p>Some content below.</p></body></html>`;

async function main() {
  console.log('[smoke] temp dir:', tmpRoot);
  console.log('[smoke] note: first `npm i` is slow — puppeteer downloads Chromium (~170MB).');

  targetServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(TARGET_HTML);
  }).listen(TARGET_PORT, '127.0.0.1');

  serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      DB_PATH: dbPath,
      SHOTS_DIR: shotsDir,
      ADMIN_PASSWORD,
      MAX_CONCURRENT: '1',
      ENABLE_TEST_SHUTDOWN: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

  const up = await waitFor(async () => (await get(`${BASE}/api/health`)).status === 200);
  assert(up, 'server did not come up on ' + SERVER_PORT);

  // ---- 1. health + auth gates ----
  const health = await get(`${BASE}/api/health`);
  const healthJson = JSON.parse(health.body.toString());
  check('health ok:true', health.status === 200 && healthJson.ok === true && 'browser' in healthJson);

  const badLogin = await postJson(`${BASE}/api/login`, { password: 'wrong' });
  check('wrong password -> 401', badLogin.status === 401);

  const keysNoAuth = await get(`${BASE}/api/keys`);
  check('keys API unauthenticated -> 401', keysNoAuth.status === 401);

  const login = await postJson(`${BASE}/api/login`, { password: ADMIN_PASSWORD });
  check('login -> 200', login.status === 200);
  const cookie = (login.headers['set-cookie'] || [])[0]?.split(';')[0];
  assert(cookie, 'no session cookie returned');
  const auth = { Cookie: cookie };

  // ---- 2. create API key ----
  const keyRes = await postJson(`${BASE}/api/keys`, { name: 'smoke' }, auth);
  const keyRow = JSON.parse(keyRes.body.toString());
  check('create key -> 201', keyRes.status === 201);
  check('key starts with sf_', typeof keyRow.key === 'string' && keyRow.key.startsWith('sf_'));
  const KEY = keyRow.key;
  const target = `http://127.0.0.1:${TARGET_PORT}`;

  // ---- 3. basic PNG screenshot ----
  const shot1 = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${KEY}`);
  check('screenshot -> 200', shot1.status === 200);
  check('content-type image/png', (shot1.headers['content-type'] || '').startsWith('image/png'));
  check('body length > 1000', shot1.body.length > 1000);
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  check('PNG magic bytes', shot1.body.subarray(0, 8).equals(PNG_MAGIC));

  const db = new Database(dbPath, { readonly: true });
  const rowsAfter1 = db.prepare("SELECT * FROM shots WHERE status = 'ok'").all();
  check('shots row exists, status ok', rowsAfter1.length === 1 && rowsAfter1[0].status === 'ok');
  const filePath = rowsAfter1[0]?.file_path;
  check('file on disk with matching size',
    filePath && fs.existsSync(filePath) && fs.statSync(filePath).size === shot1.body.length &&
    rowsAfter1[0].size_bytes === shot1.body.length);

  // ---- 4. cache HIT / fresh MISS ----
  const shot2 = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${KEY}`);
  check('second request X-Snapfleet-Cache: HIT', shot2.headers['x-snapfleet-cache'] === 'HIT');
  const countAfterHit = db.prepare('SELECT COUNT(*) AS n FROM shots').get().n;
  check('shots row count unchanged after HIT', countAfterHit === rowsAfter1.length);
  const shotFresh = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${KEY}&fresh=1`);
  check('fresh=1 -> MISS', shotFresh.headers['x-snapfleet-cache'] === 'MISS' && shotFresh.status === 200);

  // ---- 5. jpg + pdf ----
  const jpg = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${KEY}&format=jpg&quality=50`);
  check('jpg -> 200 + JPEG magic (FF D8 FF)',
    jpg.status === 200 && jpg.body[0] === 0xff && jpg.body[1] === 0xd8 && jpg.body[2] === 0xff);
  const pdf = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${KEY}&format=pdf`);
  check('pdf -> 200 + starts with %PDF',
    pdf.status === 200 && pdf.body.subarray(0, 4).toString() === '%PDF');

  // ---- 6. selector clip smaller than viewport ----
  const selShot = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${KEY}&selector=%23hero`);
  check('selector shot -> 200 PNG', selShot.status === 200 && selShot.body.subarray(0, 8).equals(PNG_MAGIC));
  const fullDims = pngSize(shot1.body);
  const selDims = pngSize(selShot.body);
  check(`selector dims (${selDims.width}x${selDims.height}) < viewport (${fullDims.width}x${fullDims.height})`,
    selDims.width < fullDims.width && selDims.height < fullDims.height);

  // ---- 7. dark_mode produces a distinct cache entry ----
  const dark = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${KEY}&dark_mode=1`);
  check('dark_mode -> 200', dark.status === 200);
  const lightRow = db.prepare("SELECT cache_hash FROM shots WHERE params_json LIKE '%\"dark_mode\":false%' AND format = 'png' AND params_json NOT LIKE '%selector\":\"#hero%'").get();
  const darkRow = db.prepare("SELECT cache_hash FROM shots WHERE params_json LIKE '%\"dark_mode\":true%'").get();
  check('dark vs light have distinct shots rows / hashes',
    lightRow && darkRow && lightRow.cache_hash !== darkRow.cache_hash);

  // ---- 8. auth + rate limit ----
  const noKey = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}`);
  check('no key -> 401', noKey.status === 401);

  const revokeRes = await postJson(`${BASE}/api/keys`, { name: 'to-revoke' }, auth);
  const revokeRow = JSON.parse(revokeRes.body.toString());
  await request('PUT', `${BASE}/api/keys/${revokeRow.id}`, {
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ revoked: true })
  });
  const revokedShot = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${revokeRow.key}`);
  check('revoked key -> 401', revokedShot.status === 401);

  const rlRes = await postJson(`${BASE}/api/keys`, { name: 'ratelimit', rate_per_min: 2 }, auth);
  const rlKey = JSON.parse(rlRes.body.toString()).key;
  const r1 = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${rlKey}`);
  const r2 = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${rlKey}`);
  const r3 = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent(target)}&key=${rlKey}`);
  check('rate_per_min=2: first two pass, third -> 429 with Retry-After',
    r1.status === 200 && r2.status === 200 && r3.status === 429 && !!r3.headers['retry-after']);

  // ---- 9. URL guard ----
  const fileUrl = await get(`${BASE}/api/v1/screenshot?url=${encodeURIComponent('file:///etc/hosts')}&key=${KEY}`);
  check('file:// url -> 400', fileUrl.status === 400);
  const noUrl = await get(`${BASE}/api/v1/screenshot?key=${KEY}`);
  check('missing url -> 400', noUrl.status === 400);

  db.close();
}

async function cleanup() {
  // Kill ONLY the children we spawned. The server closes its own Puppeteer
  // browser: via SIGTERM handler on POSIX, via the test-only shutdown
  // endpoint on Windows (where child SIGTERM handlers don't run).
  if (serverProc && serverProc.exitCode === null) {
    try {
      await postJson(`${BASE}/api/__shutdown`, {});
      await waitFor(() => serverProc.exitCode !== null, 10_000, 100);
    } catch { /* server already down */ }
    if (serverProc.exitCode === null) {
      serverProc.kill('SIGTERM');
      await waitFor(() => serverProc.exitCode !== null, 5_000, 100);
      if (serverProc.exitCode === null) serverProc.kill();
    }
  }
  if (targetServer) targetServer.close();
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* Windows file locks */ }
}

main()
  .then(async () => {
    await cleanup();
    if (failures > 0) {
      console.error(`\n[smoke] ${failures} assertion(s) FAILED`);
      process.exit(1);
    }
    console.log('\n[smoke] all assertions passed');
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('[smoke] fatal:', e);
    await cleanup();
    process.exit(1);
  });
