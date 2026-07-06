// Screenshot parameter normalization, cache hashing, and Puppeteer capture.
const crypto = require('crypto');

const FORMATS = ['png', 'jpg', 'pdf'];
const WAIT_UNTIL = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'];
const MAX_DELAY_MS = 10_000;

class ParamError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function toBool(v) {
  if (v === undefined || v === null || v === '') return false;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const PRIVATE_HOST_RE = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

// Normalize + validate raw request params into a canonical object.
// Defaults are applied HERE, before hashing, so `?width=1280` and no width
// produce the same cache key.
function normalizeParams(raw, { defaults = {}, allowPrivate = true } = {}) {
  const url = String(raw.url || '').trim();
  if (!url) throw new ParamError('Missing required parameter: url');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ParamError('Invalid url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ParamError('Only http(s) URLs are allowed');
  }
  if (!allowPrivate && PRIVATE_HOST_RE.test(parsed.hostname)) {
    throw new ParamError('Private/loopback targets are blocked (ALLOW_PRIVATE=false)');
  }

  const format = String(raw.format || defaults.default_format || 'png').toLowerCase();
  if (!FORMATS.includes(format)) throw new ParamError(`format must be one of: ${FORMATS.join(', ')}`);

  const wait_until = String(raw.wait_until || 'networkidle2');
  if (!WAIT_UNTIL.includes(wait_until)) throw new ParamError(`wait_until must be one of: ${WAIT_UNTIL.join(', ')}`);

  const params = {
    url: parsed.href,
    format,
    width: clampInt(raw.width, 100, 4000, Number(defaults.default_width) || 1280),
    height: clampInt(raw.height, 100, 4000, Number(defaults.default_height) || 800),
    full_page: toBool(raw.full_page),
    delay: clampInt(raw.delay, 0, MAX_DELAY_MS, 0),
    wait_until,
    selector: String(raw.selector || '').trim(),
    dark_mode: toBool(raw.dark_mode),
    quality: format === 'jpg' ? clampInt(raw.quality, 1, 100, Number(defaults.jpg_quality) || 80) : 0,
    scale: clampInt(raw.scale, 1, 3, 1)
  };

  // Not part of the cache identity:
  const fresh = toBool(raw.fresh);
  const ttl = raw.ttl !== undefined && raw.ttl !== ''
    ? clampInt(raw.ttl, 1, 365 * 24 * 3600, Number(defaults.default_ttl_seconds) || 86400)
    : Number(defaults.default_ttl_seconds) || 86400;

  return { params, fresh, ttl };
}

// Deterministic hash of the normalized params (sorted keys).
function cacheHash(params) {
  const sorted = {};
  for (const k of Object.keys(params).sort()) sorted[k] = params[k];
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

// Perform the actual capture on a Puppeteer page. Returns a Buffer.
async function capture(page, params) {
  await page.setViewport({
    width: params.width,
    height: params.height,
    deviceScaleFactor: params.scale
  });
  if (params.dark_mode) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  }
  await page.goto(params.url, { waitUntil: params.wait_until, timeout: 25_000 });
  if (params.delay > 0) {
    await new Promise((r) => setTimeout(r, params.delay));
  }

  if (params.format === 'pdf') {
    // full_page/selector are ignored for PDF (paged media).
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
  }

  const type = params.format === 'jpg' ? 'jpeg' : 'png';
  const shotOpts = { type };
  if (type === 'jpeg') shotOpts.quality = params.quality;

  if (params.selector) {
    const el = await page.$(params.selector);
    if (!el) throw new ParamError(`No element matches selector: ${params.selector}`);
    return Buffer.from(await el.screenshot(shotOpts));
  }
  if (params.full_page) shotOpts.fullPage = true;
  return Buffer.from(await page.screenshot(shotOpts));
}

const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' };

// Read PNG IHDR dimensions (also handles JPEG SOF markers minimally); best-effort.
function imageDimensions(buf, format) {
  try {
    if (format === 'png' && buf.length > 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (format === 'jpg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch { /* best effort */ }
  return { width: 0, height: 0 };
}

module.exports = { normalizeParams, cacheHash, capture, imageDimensions, ParamError, CONTENT_TYPES, MAX_DELAY_MS };
