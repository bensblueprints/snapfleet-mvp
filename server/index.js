const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 5322;
const app = createApp();

// Test-only shutdown endpoint (Windows can't deliver SIGTERM handlers to
// children, so the smoke test uses this to guarantee the Puppeteer browser
// is closed). Enabled ONLY when ENABLE_TEST_SHUTDOWN=1.
if (process.env.ENABLE_TEST_SHUTDOWN === '1') {
  app.post('/api/__shutdown', async (req, res) => {
    res.json({ ok: true });
    await shutdown('test-shutdown');
  });
}

const server = app.listen(PORT, () => {
  console.log(`[snapfleet] listening on http://localhost:${PORT}`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[snapfleet] ${signal} received — closing browser and exiting`);
  server.close();
  try {
    await app.locals.shutdown(); // closes ONLY the Puppeteer browser we launched
  } catch (e) {
    console.error('[snapfleet] shutdown error:', e.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
