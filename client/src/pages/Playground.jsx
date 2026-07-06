import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Copy, Check, Terminal, Link2 } from 'lucide-react';
import { api } from '../api.js';

const DEFAULTS = {
  url: 'https://example.com',
  format: 'png',
  width: 1280,
  height: 800,
  full_page: false,
  delay: 0,
  wait_until: 'networkidle2',
  selector: '',
  dark_mode: false,
  quality: 80,
  scale: 1,
  fresh: false,
  ttl: ''
};

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-ghost !px-2.5 !py-1.5"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
    </button>
  );
}

export default function Playground() {
  const [p, setP] = useState(DEFAULTS);
  const [keys, setKeys] = useState([]);
  const [keyId, setKeyId] = useState(null);
  const [preview, setPreview] = useState(null); // { blobUrl, ms, cache, size, type }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/keys').then((ks) => {
      const live = ks.filter((k) => !k.revoked);
      setKeys(live);
      if (live.length) setKeyId(live[0].id);
    }).catch(() => {});
  }, []);

  const activeKey = keys.find((k) => k.id === keyId);
  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }));

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    q.set('url', p.url);
    if (p.format !== 'png') q.set('format', p.format);
    if (Number(p.width) !== 1280) q.set('width', p.width);
    if (Number(p.height) !== 800) q.set('height', p.height);
    if (p.full_page) q.set('full_page', '1');
    if (Number(p.delay) > 0) q.set('delay', p.delay);
    if (p.wait_until !== 'networkidle2') q.set('wait_until', p.wait_until);
    if (p.selector) q.set('selector', p.selector);
    if (p.dark_mode) q.set('dark_mode', '1');
    if (p.format === 'jpg' && Number(p.quality) !== 80) q.set('quality', p.quality);
    if (Number(p.scale) !== 1) q.set('scale', p.scale);
    if (p.fresh) q.set('fresh', '1');
    if (p.ttl !== '') q.set('ttl', p.ttl);
    q.set('key', activeKey ? activeKey.key : 'YOUR_API_KEY');
    return q.toString();
  }, [p, activeKey]);

  const requestUrl = `${window.location.origin}/api/v1/screenshot?${queryString}`;
  const curl = `curl -o shot.${p.format} "${requestUrl}"`;

  async function run() {
    if (!activeKey) {
      setError('Create an API key first (API Keys page).');
      return;
    }
    setBusy(true);
    setError('');
    const started = Date.now();
    try {
      const res = await fetch(`/api/v1/screenshot?${queryString}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
      setPreview({
        blobUrl: URL.createObjectURL(blob),
        ms: Date.now() - started,
        cache: res.headers.get('X-Snapfleet-Cache'),
        size: blob.size,
        type: blob.type
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Playground</h1>
      <p className="text-zinc-500 text-sm mb-6">Tune every parameter, preview live, copy the request.</p>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <div className="card p-5 space-y-4 self-start">
          <div>
            <label className="label">URL</label>
            <input className="input" value={p.url} onChange={(e) => set('url', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Format</label>
              <select className="input" value={p.format} onChange={(e) => set('format', e.target.value)}>
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
            <div>
              <label className="label">Wait until</label>
              <select className="input" value={p.wait_until} onChange={(e) => set('wait_until', e.target.value)}>
                <option>networkidle2</option>
                <option>networkidle0</option>
                <option>load</option>
                <option>domcontentloaded</option>
              </select>
            </div>
            <div>
              <label className="label">Width</label>
              <input className="input" type="number" value={p.width} onChange={(e) => set('width', e.target.value)} />
            </div>
            <div>
              <label className="label">Height</label>
              <input className="input" type="number" value={p.height} onChange={(e) => set('height', e.target.value)} />
            </div>
            <div>
              <label className="label">Delay (ms)</label>
              <input className="input" type="number" min="0" max="10000" value={p.delay} onChange={(e) => set('delay', e.target.value)} />
            </div>
            <div>
              <label className="label">Scale (1–3)</label>
              <input className="input" type="number" min="1" max="3" value={p.scale} onChange={(e) => set('scale', e.target.value)} />
            </div>
            {p.format === 'jpg' && (
              <div>
                <label className="label">JPG quality</label>
                <input className="input" type="number" min="1" max="100" value={p.quality} onChange={(e) => set('quality', e.target.value)} />
              </div>
            )}
            <div>
              <label className="label">TTL (s, optional)</label>
              <input className="input" type="number" placeholder="86400" value={p.ttl} onChange={(e) => set('ttl', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">CSS selector (clip to element)</label>
            <input className="input" placeholder="#hero, .pricing-table…" value={p.selector} onChange={(e) => set('selector', e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {[['full_page', 'Full page'], ['dark_mode', 'Dark mode'], ['fresh', 'Bypass cache']].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  className="accent-violet-600"
                  checked={p[k]}
                  onChange={(e) => set(k, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <div>
            <label className="label">API key</label>
            <select className="input" value={keyId ?? ''} onChange={(e) => setKeyId(Number(e.target.value))}>
              {keys.length === 0 && <option value="">— create one on the API Keys page —</option>}
              {keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
          <button className="btn-primary w-full justify-center" onClick={run} disabled={busy}>
            <Play size={15} /> {busy ? 'Rendering…' : 'Take screenshot'}
          </button>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="space-y-4 min-w-0">
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2"><Link2 size={13} /> REQUEST URL</div>
            <div className="flex items-start gap-2">
              <code className="text-xs text-violet-300 break-all flex-1 leading-relaxed">{requestUrl}</code>
              <CopyBtn text={requestUrl} />
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2"><Terminal size={13} /> CURL</div>
            <div className="flex items-start gap-2">
              <code className="text-xs text-emerald-300 break-all flex-1 leading-relaxed">{curl}</code>
              <CopyBtn text={curl} />
            </div>
          </div>
          <div className="card p-4 min-h-[320px]">
            {preview ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center gap-3 text-xs text-zinc-400 mb-3">
                  <span className={`px-2 py-0.5 rounded font-medium ${preview.cache === 'HIT' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-violet-900/50 text-violet-300'}`}>
                    CACHE {preview.cache}
                  </span>
                  <span>{preview.ms} ms</span>
                  <span>{(preview.size / 1024).toFixed(1)} KB</span>
                  <span>{preview.type}</span>
                </div>
                {preview.type === 'application/pdf' ? (
                  <iframe title="pdf" src={preview.blobUrl} className="w-full h-[480px] rounded-lg bg-white" />
                ) : (
                  <img src={preview.blobUrl} alt="screenshot" className="rounded-lg border border-zinc-800 max-w-full" />
                )}
              </motion.div>
            ) : (
              <div className="h-full min-h-[280px] flex items-center justify-center text-zinc-600 text-sm">
                Your screenshot preview will appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
