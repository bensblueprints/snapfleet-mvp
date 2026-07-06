# Launch Strategy — Snapfleet

## Positioning
"Every screenshot API charges per render. Your VPS renders for free." Snapfleet is the pay-once, self-hosted alternative to Urlbox ($19/mo for 2k renders), ScreenshotOne ($17/mo), ApiFlash ($7/mo for 1k), and Browserless ($30/mo).

## Target communities

### r/selfhosted (rules-aware angle)
Genuine "I built and open-sourced this" post — the sub loves replacing SaaS with owned software and allows dev posts of open-source tools. Lead with the MIT repo, docker-compose one-liner, and the `ALLOW_PRIVATE` feature (screenshot your *internal* dashboards — something no cloud API can do). Mention the paid installer only if asked.

### r/webdev
Angle: the og-image / link-preview workflow. "How I generate open-graph images for free with a self-hosted screenshot API" — show the 3-line curl → social card pipeline. Follow the sub's Showoff Saturday rule for the direct project link.

### r/SaaS
Angle: builders here all need link previews, og-images and PDF exports for their products, and they feel per-render pricing directly in their margins. Post the cost math (Urlbox $228/yr vs $39 once at your own infra) as a build-vs-buy story, not an ad.

## Hacker News — Show HN draft

**Title:** Show HN: Snapfleet – Self-hosted screenshot API (Puppeteer, one endpoint, MIT)

**Body:**
I kept paying screenshot SaaS APIs ($7–$30/mo) to do something my own servers can do: run headless Chromium. So I built Snapfleet — a self-hosted screenshot API with the same ergonomics as the paid ones.

One endpoint: GET /api/v1/screenshot?url=… returns PNG/JPG/PDF. Params for viewport, full-page, delay, wait_until, CSS-selector clipping, dark-mode emulation, JPEG quality and deviceScaleFactor. Around it: named API keys with token-bucket rate limits and daily quotas, a SHA-256-keyed disk cache with TTL sweep and HIT/MISS headers, and a pooled browser (N concurrent pages, 30s job timeouts, auto-relaunch on crash — page.close() in finally, never kill the browser).

Stack is Node/Express + better-sqlite3 + React, runs via npm, Docker (official puppeteer image), or as an Electron desktop app. A smoke test renders real screenshots against a local page and asserts on PNG magic bytes and IHDR dimensions.

Interesting design corner: cache normalization — defaults are applied *before* hashing, so `?width=1280` and no width hit the same cache entry. And ALLOW_PRIVATE defaults to true since self-hosters legitimately screenshot internal dashboards — flip it off for multi-tenant SSRF hygiene.

Code (MIT): https://github.com/bensblueprints/snapfleet

## SEO keywords (10)
1. screenshot api self hosted
2. urlbox alternative
3. puppeteer screenshot service
4. website to pdf api
5. url to png
6. screenshotone alternative
7. open source screenshot api
8. og image generator api
9. website thumbnail api
10. apiflash alternative self hosted

## AppSumo / PitchGround pitch
Snapfleet gives agencies and indie developers an unlimited screenshot API on their own infrastructure — the exact product Urlbox and ScreenshotOne rent for $17–$19/month, sold once. One endpoint renders any URL to PNG, JPG or PDF with full-page, dark-mode, selector-clipping and retina options; built-in API keys, rate limits and caching make it safe to expose to clients and CI pipelines. It installs in minutes via Docker or a 1-click desktop app, ships with a live playground that generates copy-paste curl commands, and is MIT-licensed so buyers own it outright. Lifetime-deal buyers love killing subscriptions: this one kills a $228/year line item on day one.

## Pricing
**$39 one-time.** Competitor math: Urlbox is $19/mo → Snapfleet pays for itself in **just over 2 months** ($228/yr saved), ScreenshotOne $17/mo → 2.3 months, even budget ApiFlash $7/mo → 5.6 months. Anchor: "Less than 2 months of Urlbox. Unlimited renders forever."
