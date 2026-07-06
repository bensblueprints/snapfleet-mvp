const PARAMS = [
  ['url', 'string', 'required', 'The http(s) URL to capture.'],
  ['format', 'png | jpg | pdf', 'png', 'Output format. PDF renders A4 via Chromium print (full_page/selector ignored).'],
  ['width', 'int 100–4000', '1280', 'Viewport width in px.'],
  ['height', 'int 100–4000', '800', 'Viewport height in px.'],
  ['full_page', 'bool', 'false', 'Capture the entire scrollable page.'],
  ['delay', 'int ms, max 10000', '0', 'Extra wait after page load (animations, lazy content).'],
  ['wait_until', 'load | domcontentloaded | networkidle0 | networkidle2', 'networkidle2', 'Puppeteer navigation lifecycle to wait for.'],
  ['selector', 'CSS selector', '—', 'Clip the shot to the first matching element (400 if none matches).'],
  ['dark_mode', 'bool', 'false', 'Emulates prefers-color-scheme: dark.'],
  ['quality', 'int 1–100', '80', 'JPEG quality (jpg only).'],
  ['scale', 'int 1–3', '1', 'deviceScaleFactor — 2 for retina-sharp shots.'],
  ['fresh', 'bool', 'false', 'Bypass the cache and force a new render.'],
  ['ttl', 'int seconds', 'server default (86400)', 'Per-request cache lifetime override.'],
  ['key', 'string', 'required', 'API key (or send X-Api-Key header).']
];

const ENDPOINTS = [
  ['GET|POST', '/api/v1/screenshot', 'API key', 'Returns image/PDF bytes. POST accepts the same params as a JSON body. Response header X-Snapfleet-Cache: HIT|MISS.'],
  ['GET', '/api/health', 'none', 'Server + browser pool status.'],
  ['POST', '/api/login', 'password', 'Start an admin session (cookie).'],
  ['GET|POST', '/api/keys', 'session', 'List / create API keys.'],
  ['PUT|DELETE', '/api/keys/:id', 'session', 'Update (name, rate_per_min, daily_quota, revoked) / delete a key.'],
  ['POST', '/api/keys/:id/regenerate', 'session', 'Rotate the key string (also un-revokes).'],
  ['GET', '/api/shots?limit=&q=', 'session', 'Gallery listing.'],
  ['GET', '/api/shots/:id/file', 'session', 'Raw stored file.'],
  ['DELETE', '/api/shots/:id', 'session', 'Delete a shot + file.'],
  ['POST', '/api/shots/:id/retake', 'session', 'Re-render with the stored params.'],
  ['GET', '/api/stats', 'session', 'Usage stats for the dashboard.'],
  ['GET|PUT', '/api/settings', 'session', 'Server defaults.'],
  ['POST', '/api/cache/clear', 'session', 'Delete all cached files + history.']
];

export default function Docs() {
  const origin = window.location.origin;
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">API Documentation</h1>
      <p className="text-zinc-500 text-sm mb-6">Everything lives behind one endpoint.</p>

      <div className="card p-5 mb-6">
        <div className="text-sm font-medium mb-3">Quick start</div>
        <pre className="bg-zinc-950 rounded-lg p-4 text-xs text-emerald-300 overflow-x-auto leading-relaxed">
{`# PNG screenshot
curl -o shot.png "${origin}/api/v1/screenshot?url=https://example.com&key=sf_..."

# Full-page dark-mode JPG
curl -o shot.jpg "${origin}/api/v1/screenshot?url=https://example.com&format=jpg&full_page=1&dark_mode=1&key=sf_..."

# PDF export
curl -o page.pdf "${origin}/api/v1/screenshot?url=https://example.com&format=pdf&key=sf_..."

# POST with JSON body
curl -X POST "${origin}/api/v1/screenshot" \\
  -H "Content-Type: application/json" -H "X-Api-Key: sf_..." \\
  -d '{"url":"https://example.com","selector":"#pricing","scale":2}'`}
        </pre>
      </div>

      <div className="card p-5 mb-6 overflow-x-auto">
        <div className="text-sm font-medium mb-3">Parameters — GET /api/v1/screenshot</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
              <th className="pb-2 pr-4 font-medium">Param</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 font-medium">Default</th>
              <th className="pb-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {PARAMS.map(([p, t, d, desc]) => (
              <tr key={p} className="border-b border-zinc-800/50 last:border-0">
                <td className="py-2 pr-4"><code className="text-violet-300 text-xs">{p}</code></td>
                <td className="py-2 pr-4 text-zinc-400 text-xs">{t}</td>
                <td className="py-2 pr-4 text-zinc-500 text-xs">{d}</td>
                <td className="py-2 text-zinc-300 text-xs">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5 mb-6 overflow-x-auto">
        <div className="text-sm font-medium mb-3">All endpoints</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
              <th className="pb-2 pr-4 font-medium">Method</th>
              <th className="pb-2 pr-4 font-medium">Path</th>
              <th className="pb-2 pr-4 font-medium">Auth</th>
              <th className="pb-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map(([m, p, a, d]) => (
              <tr key={m + p} className="border-b border-zinc-800/50 last:border-0">
                <td className="py-2 pr-4 text-emerald-300 text-xs font-medium whitespace-nowrap">{m}</td>
                <td className="py-2 pr-4"><code className="text-violet-300 text-xs">{p}</code></td>
                <td className="py-2 pr-4 text-zinc-500 text-xs whitespace-nowrap">{a}</td>
                <td className="py-2 text-zinc-300 text-xs">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <div className="text-sm font-medium mb-2">Caching & rate limits</div>
        <ul className="text-sm text-zinc-400 space-y-1.5 list-disc pl-5">
          <li>Identical requests are cached — the cache key is a SHA-256 of the normalized parameters. Hits return <code className="text-violet-300">X-Snapfleet-Cache: HIT</code>.</li>
          <li>Default TTL is 24h (configurable in Settings, or per request with <code className="text-violet-300">ttl</code>). Expired files are swept hourly.</li>
          <li>Each key has a per-minute token bucket (default 60/min) and an optional daily quota. Exceeding either returns <code className="text-violet-300">429</code> with a <code className="text-violet-300">Retry-After</code> header.</li>
          <li>Only http/https URLs are accepted. Set <code className="text-violet-300">ALLOW_PRIVATE=false</code> to also block localhost/RFC1918 targets.</li>
        </ul>
      </div>
    </div>
  );
}
