import { useEffect, useState } from 'react';
import { Save, Trash2, ShieldAlert, Check } from 'lucide-react';
import { api } from '../api.js';

export default function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(null);

  useEffect(() => { api.get('/api/settings').then(setS); }, []);
  if (!s) return <div className="text-zinc-500">Loading…</div>;

  const set = (k, v) => setS((prev) => ({ ...prev, [k]: v }));

  async function save() {
    const next = await api.put('/api/settings', s);
    setS(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function clearCache() {
    const r = await api.post('/api/cache/clear', {});
    setCleared(r.removed);
    setTimeout(() => setCleared(null), 2500);
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-zinc-500 text-sm mb-6">Defaults applied when a request omits a parameter.</p>

      <div className="card p-5 space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Default TTL (seconds)</label>
            <input className="input" type="number" min="1" value={s.default_ttl_seconds} onChange={(e) => set('default_ttl_seconds', e.target.value)} />
          </div>
          <div>
            <label className="label">Default format</label>
            <select className="input" value={s.default_format} onChange={(e) => set('default_format', e.target.value)}>
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
          <div>
            <label className="label">Default width</label>
            <input className="input" type="number" value={s.default_width} onChange={(e) => set('default_width', e.target.value)} />
          </div>
          <div>
            <label className="label">Default height</label>
            <input className="input" type="number" value={s.default_height} onChange={(e) => set('default_height', e.target.value)} />
          </div>
          <div>
            <label className="label">Default JPG quality</label>
            <input className="input" type="number" min="1" max="100" value={s.jpg_quality} onChange={(e) => set('jpg_quality', e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" onClick={save}>
          {saved ? <Check size={15} /> : <Save size={15} />} {saved ? 'Saved' : 'Save settings'}
        </button>
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center gap-2 text-sm font-medium mb-2"><ShieldAlert size={15} className="text-amber-400" /> SSRF guard</div>
        <p className="text-sm text-zinc-400 mb-2">
          Private / loopback targets are currently <b className={s.allow_private ? 'text-emerald-400' : 'text-red-400'}>{s.allow_private ? 'allowed' : 'blocked'}</b>.
          Self-hosters often screenshot internal dashboards, so this defaults to allowed. Set <code className="text-violet-300">ALLOW_PRIVATE=false</code> in the environment to block localhost / RFC1918 targets.
        </p>
      </div>

      <div className="card p-5">
        <div className="text-sm font-medium mb-2">Cache</div>
        <p className="text-sm text-zinc-400 mb-3">Delete all cached screenshots and history. Expired files are also swept automatically every hour.</p>
        <button className="btn-danger" onClick={clearCache}>
          <Trash2 size={15} /> {cleared !== null ? `Cleared ${cleared} files` : 'Clear cache'}
        </button>
      </div>
    </div>
  );
}
