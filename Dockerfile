# Snapfleet — self-hosted screenshot API
# Uses the official Puppeteer image: Chrome + all system deps preinstalled,
# so npm install here does NOT re-download Chromium.
FROM ghcr.io/puppeteer/puppeteer:24.10.0

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_ARGS=--no-sandbox \
    PORT=5322 \
    DB_PATH=/app/data/snapfleet.db \
    SHOTS_DIR=/app/data/shots

WORKDIR /app

USER root
# python3-setuptools: better-sqlite3 has no prebuilt binary for every Node
# patch version, so it can fall back to compiling from source, which needs
# a full toolchain including the distutils shim newer Python drops by default.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-setuptools make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY scripts ./scripts
# devDependencies are needed for the vite build; Electron is skipped gracefully.
RUN npm install --no-audit --no-fund --include=dev

COPY . .
RUN npm run build && mkdir -p /app/data && chown -R pptruser:pptruser /app

USER pptruser
EXPOSE 5322
CMD ["node", "server/index.js"]
