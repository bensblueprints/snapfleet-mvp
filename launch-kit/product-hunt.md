# Product Hunt Launch — Snapfleet

## Name
Snapfleet

## Tagline (60 chars)
Self-hosted screenshot API. Unlimited renders. Pay once.

## Description (260 chars)
Snapfleet turns any URL into a PNG, JPG or PDF through one API endpoint — on your own server. Viewport, full-page, dark-mode and selector control, API keys, rate limits and a smart cache. $39 once instead of $19/mo for Urlbox. Your VPS renders for free.

## Full description
Every screenshot API charges you per render — Urlbox starts at $19/mo, ScreenshotOne at $17/mo, ApiFlash at $7/mo. But rendering a screenshot is just… running Chromium. Your $5 VPS can do that all day.

Snapfleet is a self-hosted screenshot API you install once and own forever:

- **One endpoint** — `GET /api/v1/screenshot?url=…` returns PNG/JPG/PDF bytes. Control viewport, full-page, delay, wait conditions, dark-mode emulation, JPEG quality, retina scale, and clip to any CSS selector.
- **Production-grade plumbing** — named API keys with per-key rate limits and daily quotas, a SHA-256-keyed disk cache with TTLs and `X-Snapfleet-Cache` headers, a pooled Chromium instance with queueing, job timeouts and crash recovery.
- **A playground that sells itself** — tweak every parameter with a live preview and copy the exact request URL or curl command.
- **Gallery + dashboard** — browse recent shots, re-take, delete; watch request volume, cache hit rate and render times.
- **Runs anywhere** — `npm start` on a VPS, `docker compose up`, or as a desktop app (Electron) with zero config.

Open source (MIT). Use cases: og-image generation, link previews, PDF invoices/receipts of web pages, visual monitoring, archiving, thumbnails for directories.

## Maker first comment
Hey PH 👋

I got tired of paying $19/mo to Urlbox to generate og-images and link previews for side projects that made $0/mo. The math never worked: 2,000 renders for $228/year, when a Hetzner box I already pay for can render unlimited screenshots with Puppeteer.

So I built Snapfleet — the same clean API the SaaS guys sell (one endpoint, format/viewport/selector/dark-mode params, API keys, rate limits, caching), but self-hosted and yours forever for a one-time $39. The open-source code is MIT on GitHub if you'd rather set it up yourself; the paid version is just the 1-click installer for people who don't want to touch a terminal.

Happy to answer anything about the Puppeteer pooling, the cache design, or why `networkidle2` is the right default 🙂

## Gallery shots (5)
1. **Playground hero** — dark UI, form on the left with every parameter, live rendered preview of a real site on the right, generated curl command visible.
2. **Dashboard** — stats tiles (requests, cache hit rate, avg render ms, storage) + hourly request bar chart.
3. **Gallery grid** — a wall of cached screenshot thumbnails with cache-state badges.
4. **API keys screen** — keys table with rate limit / quota columns and a freshly created `sf_…` key banner.
5. **Terminal shot** — a single curl command next to the resulting PNG, captioned "One endpoint. Your server. $0 per render."
