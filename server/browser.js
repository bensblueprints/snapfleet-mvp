// Shared Puppeteer browser pool.
// One lazily-launched browser instance, N concurrent pages (MAX_CONCURRENT),
// a FIFO queue beyond that with a per-job timeout, and auto-relaunch on crash.
// IMPORTANT: only ever kills the browser process it launched itself.
const puppeteer = require('puppeteer');

const JOB_TIMEOUT_MS = 30_000;

function createBrowserPool(opts = {}) {
  const maxConcurrent = Math.max(1, Number(opts.maxConcurrent) || 2);
  const extraArgs = String(opts.puppeteerArgs || '').split(/\s+/).filter(Boolean);
  const executablePath = opts.executablePath || undefined;

  let browser = null;        // live Browser instance or null
  let launching = null;      // in-flight launch promise
  let active = 0;            // pages currently rendering
  const queue = [];          // waiters for a free slot
  let closed = false;        // pool shut down — reject all new work

  async function getBrowser() {
    if (closed) throw new Error('Browser pool is shut down');
    if (browser && browser.connected) return browser;
    if (!launching) {
      launching = puppeteer
        .launch({
          headless: true,
          executablePath,
          args: ['--disable-dev-shm-usage', ...extraArgs]
        })
        .then((b) => {
          browser = b;
          // auto-relaunch: when the browser dies, drop the handle so the
          // next job launches a fresh one.
          b.on('disconnected', () => {
            if (browser === b) browser = null;
          });
          return b;
        })
        .finally(() => {
          launching = null;
        });
    }
    return launching;
  }

  function acquireSlot() {
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => queue.push({ resolve, reject }));
  }

  function releaseSlot() {
    const next = queue.shift();
    if (next) {
      next.resolve(); // slot handed over, `active` count carries across
    } else {
      active -= 1;
    }
  }

  // Run `fn(page)` on a fresh page with a hard job timeout.
  // Timeout kills the PAGE, never the browser.
  async function withPage(fn, { timeoutMs = JOB_TIMEOUT_MS } = {}) {
    await acquireSlot();
    let page = null;
    try {
      const b = await getBrowser();
      page = await b.newPage();
      let timer = null;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Job timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      try {
        return await Promise.race([fn(page), timeout]);
      } finally {
        clearTimeout(timer);
      }
    } finally {
      if (page) {
        try { await page.close(); } catch { /* page/browser already gone */ }
      }
      releaseSlot();
    }
  }

  function status() {
    if (browser && browser.connected) return 'running';
    if (launching) return 'launching';
    return 'idle';
  }

  // Close ONLY the browser this pool launched. Never touches other processes.
  async function shutdown() {
    closed = true;
    while (queue.length) queue.shift().reject(new Error('Server shutting down'));
    const b = browser;
    browser = null;
    if (b) {
      try {
        await b.close();
      } catch {
        try {
          const proc = b.process();
          if (proc && !proc.killed) proc.kill(); // our own child PID only
        } catch { /* already dead */ }
      }
    }
  }

  return { withPage, status, shutdown, get activeCount() { return active; }, get queueLength() { return queue.length; } };
}

module.exports = { createBrowserPool, JOB_TIMEOUT_MS };
