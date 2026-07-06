import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, Trash2, Copy, X, Check, AlertTriangle } from 'lucide-react';
import { api } from '../api.js';

function fmtBytes(n) {
  if (!n) return '—';
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

export default function Gallery() {
  const [shots, setShots] = useState([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);

  async function load(query = q) {
    const rows = await api.get(`/api/shots?limit=120&q=${encodeURIComponent(query)}`);
    setShots(rows);
  }
  useEffect(() => { load(''); }, []);

  async function retake(shot) {
    await api.post(`/api/shots/${shot.id}/retake`, {});
    await load();
    setSelected(null);
  }
  async function remove(shot) {
    await api.del(`/api/shots/${shot.id}`);
    setShots((s) => s.filter((x) => x.id !== shot.id));
    setSelected(null);
  }
  function copyRequestUrl(shot) {
    const params = JSON.parse(shot.params_json);
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === false || v === '' || v === 0 || v === null) continue;
      qp.set(k, v === true ? '1' : String(v));
    }
    qp.set('key', 'YOUR_API_KEY');
    navigator.clipboard.writeText(`${window.location.origin}/api/v1/screenshot?${qp.toString()}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Gallery</h1>
          <p className="text-zinc-500 text-sm">Recent screenshots and their cache state.</p>
        </div>
        <div className="relative w-72">
          <Search size={15} className="absolute left-3 top-2.5 text-zinc-500" />
          <input
            className="input !pl-9"
            placeholder="Filter by URL…"
            value={q}
            onChange={(e) => { setQ(e.target.value); load(e.target.value); }}
          />
        </div>
      </div>

      {shots.length === 0 ? (
        <div className="card p-12 text-center text-zinc-600 text-sm">No screenshots yet.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {shots.map((s) => (
            <motion.button
              key={s.id}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card overflow-hidden text-left group cursor-pointer"
              onClick={() => setSelected(s)}
            >
              <div className="aspect-video bg-zinc-900 overflow-hidden flex items-center justify-center">
                {s.status === 'ok' && s.cached && s.format !== 'pdf' ? (
                  <img src={`/api/shots/${s.id}/file`} alt={s.url} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform" loading="lazy" />
                ) : s.status === 'error' ? (
                  <AlertTriangle className="text-red-500" />
                ) : (
                  <span className="text-zinc-600 text-xs uppercase">{s.format}{s.cached ? '' : ' · expired'}</span>
                )}
              </div>
              <div className="p-3">
                <div className="text-xs text-zinc-300 truncate">{s.url}</div>
                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-500">
                  <span className="uppercase font-medium">{s.format}</span>
                  {s.width > 0 && <span>{s.width}×{s.height}</span>}
                  <span>{fmtBytes(s.size_bytes)}</span>
                  <span className={`ml-auto px-1.5 py-0.5 rounded ${s.status === 'error' ? 'bg-red-900/50 text-red-300' : s.cached ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                    {s.status === 'error' ? 'error' : s.cached ? 'cached' : 'expired'}
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="card max-w-4xl w-full max-h-[85vh] overflow-auto p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{selected.url}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {selected.created_at} · {selected.took_ms} ms · expires {selected.expires_at?.slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
                <button className="btn-ghost !p-2" onClick={() => setSelected(null)}><X size={16} /></button>
              </div>
              {selected.status === 'error' ? (
                <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-sm text-red-300 mb-4">{selected.error}</div>
              ) : selected.cached ? (
                selected.format === 'pdf'
                  ? <iframe title="pdf" src={`/api/shots/${selected.id}/file`} className="w-full h-[50vh] rounded-lg bg-white mb-4" />
                  : <img src={`/api/shots/${selected.id}/file`} alt={selected.url} className="rounded-lg border border-zinc-800 max-w-full mb-4" />
              ) : (
                <div className="text-zinc-500 text-sm mb-4">File expired — retake to regenerate.</div>
              )}
              <pre className="bg-zinc-950 rounded-lg p-3 text-xs text-zinc-400 overflow-auto mb-4">{JSON.stringify(JSON.parse(selected.params_json), null, 2)}</pre>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => retake(selected)}><RefreshCw size={14} /> Re-take</button>
                <button className="btn-ghost" onClick={() => copyRequestUrl(selected)}>
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} Copy request URL
                </button>
                <button className="btn-danger ml-auto" onClick={() => remove(selected)}><Trash2 size={14} /> Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
