# 📸 Snapfleet — Self-hosted Screenshot API

[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6.svg)](LICENSE)

**Unlimited screenshots. Your server. Pay once.**

Snapfleet is a self-hosted screenshot API powered by Puppeteer. One endpoint turns any URL into a PNG, JPG, or PDF — with viewport control, full-page capture, dark-mode emulation, element clipping, retina scaling, and a smart disk cache. Stop paying Urlbox $19/month to render pixels your own VPS renders for free.

![Snapfleet screenshot](docs/screenshot.png)

## ✨ Features

- **One endpoint, every option** — `GET /api/v1/screenshot?url=…` (or POST JSON) with `format` (png/jpg/pdf), `width`/`height`, `full_page`, `delay`, `wait_until`, `selector` (clip to any element), `dark_mode`, `quality`, `scale` (retina), `fresh`, and per-request `ttl`.
- **API keys built in** — named keys, per-key rate limits (token bucket, `429` + `Retry-After`) and daily quotas, usage counters, revoke/regenerate. `?key=` or `X-Api-Key` header.
- **Smart cache** — identical requests hit a SHA-256-keyed disk cache (`X-Snapfleet-Cache: HIT`), default 24h TTL, hourly sweep, per-request bypass.
- **Browser pool** — one shared Chromium, configurable concurrency, request queue with 30s job timeouts, automatic relaunch if the browser crashes.
- **Playground UI** — a slick dark admin panel: live preview of every parameter with the generated request URL and curl one-liner to copy.
- **Gallery + stats** — browse recent shots, re-take, delete; dashboard with request volume, cache hit rate, average render time.
- **SSRF guard** — non-http(s) schemes are always blocked; `ALLOW_PRIVATE=false` additionally blocks localhost/RFC1918 targets (default allows them, since self-hosters often shoot internal dashboards).
- **100% local** — your URLs and screenshots never leave your machine. No telemetry.

## 🚀 Quick start

```bash
npm i          # heads-up: puppeteer downloads Chromium (~170MB) on first install
npm run build  # build the admin UI
npm start      # → http://localhost:5322  (admin password: "admin")
```

Create an API key in the UI, then:

```bash
curl -o shot.png "http://localhost:5322/api/v1/screenshot?url=https://example.com&key=sf_..."
```

## 🖥️ Desktop app or VPS — your choice

Run it as a desktop app, or deploy to a $5 VPS when you need it public.

```bash
npm run desktop   # Electron window, auto-logged-in, data in your user profile
```

Or with Docker (Chromium + deps preinstalled via the official Puppeteer image):

```bash
docker compose up -d   # → http://localhost:5322
```

Configuration lives in `.env` (see [`.env.example`](.env.example)): `PORT`, `ADMIN_PASSWORD`, `DB_PATH`, `SHOTS_DIR`, `DEFAULT_TTL_SECONDS`, `MAX_CONCURRENT`, `ALLOW_PRIVATE`, `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_ARGS`.

## 🧰 Tech stack

Node 20+ · Express · Puppeteer · better-sqlite3 · React (Vite) · Tailwind CSS · Framer Motion · Lucide · Electron (desktop mode)

## ⚖️ Snapfleet vs. the subscription guys

| | **Snapfleet** | Urlbox | ScreenshotOne | ApiFlash |
|---|---|---|---|---|
| Price | **$39 once** | $19/mo | $17/mo | $7/mo |
| Renders | **Unlimited** | 2,000/mo | 2,000/mo | 1,000/mo |
| Your data stays yours | ✅ self-hosted | ❌ their cloud | ❌ their cloud | ❌ their cloud |
| PNG / JPG / PDF | ✅ | ✅ | ✅ | ✅ |
| Element clipping (`selector`) | ✅ | ✅ | ✅ | ❌ |
| Dark-mode emulation | ✅ | ✅ | ✅ | ❌ |
| Internal/localhost targets | ✅ | ❌ | ❌ | ❌ |
| API keys + rate limits | ✅ | ✅ | ✅ | ✅ |
| Cost after 1 year | **$39** | $228 | $204 | $84 |

## ☕ Skip the setup — get the 1-click installer

Don't want to touch a terminal? Grab the packaged installer (Windows, one click, auto-updates):

**→ [https://whop.com/benjisaiempire/snapfleet](https://whop.com/benjisaiempire/snapfleet)**

Pay once. Own it forever. No subscription.

## 🧪 Tests

```bash
npm test
```

Spawns the real server against a local target page and asserts on real rendered bytes: PNG/JPEG/PDF magic numbers, IHDR dimensions for selector clipping, cache HIT/MISS headers, SQLite rows, rate limiting (429), auth gates, and URL guards.

## 📄 License

[MIT](LICENSE) © 2026 Ben (bensblueprints)
