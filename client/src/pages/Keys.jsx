import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Copy, Check, RotateCw, Ban, Trash2, Eye, EyeOff } from 'lucide-react';
import { api } from '../api.js';

function KeyRow({ k, onChange }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  async function update(patch) {
    await api.put(`/api/keys/${k.id}`, patch);
    onChange();
  }

  return (
    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-zinc-800/60 last:border-0">
      <td className="py-3 pr-4">
        <div className="font-medium text-sm">{k.name}</div>
        <div className="text-[11px] text-zinc-500">created {k.created_at?.slice(0, 10)}</div>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5">
          <code className={`text-xs ${k.revoked ? 'text-zinc-600 line-through' : 'text-violet-300'}`}>
            {show ? k.key : `${k.key.slice(0, 6)}••••••••••••`}
          </code>
          <button className="text-zinc-500 hover:text-zinc-300 cursor-pointer" onClick={() => setShow(!show)}>
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
            onClick={async () => {
              await navigator.clipboard.writeText(k.key);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
        </div>
      </td>
      <td className="py-3 pr-4">
        <input
          className="input !w-20 !py-1 !text-xs"
          type="number" min="1"
          defaultValue={k.rate_per_min}
          onBlur={(e) => Number(e.target.value) !== k.rate_per_min && update({ rate_per_min: Number(e.target.value) })}
        />
      </td>
      <td className="py-3 pr-4">
        <input
          className="input !w-24 !py-1 !text-xs"
          type="number" min="0"
          title="0 = unlimited"
          defaultValue={k.daily_quota}
          onBlur={(e) => Number(e.target.value) !== k.daily_quota && update({ daily_quota: Number(e.target.value) })}
        />
      </td>
      <td className="py-3 pr-4 text-sm text-zinc-400">
        {k.requests_today} <span className="text-zinc-600">today</span>
        <div className="text-[11px] text-zinc-600">{k.requests_total} total</div>
      </td>
      <td className="py-3">
        <div className="flex items-center gap-1.5 justify-end">
          {k.revoked ? (
            <span className="text-[11px] bg-red-900/40 text-red-300 px-2 py-1 rounded mr-1">revoked</span>
          ) : (
            <button className="btn-ghost !px-2 !py-1.5 !text-xs" title="Revoke" onClick={() => update({ revoked: true })}>
              <Ban size={13} />
            </button>
          )}
          <button
            className="btn-ghost !px-2 !py-1.5 !text-xs" title="Regenerate (un-revokes)"
            onClick={async () => { await api.post(`/api/keys/${k.id}/regenerate`, {}); onChange(); }}
          >
            <RotateCw size={13} />
          </button>
          <button
            className="btn-danger !px-2 !py-1.5 !text-xs" title="Delete"
            onClick={async () => { await api.del(`/api/keys/${k.id}`); onChange(); }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

export default function Keys() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [justCreated, setJustCreated] = useState(null);

  const load = () => api.get('/api/keys').then(setKeys);
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    const row = await api.post('/api/keys', { name: name || 'Unnamed key' });
    setName('');
    setJustCreated(row);
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">API Keys</h1>
      <p className="text-zinc-500 text-sm mb-6">
        Pass a key as <code className="text-violet-300">?key=</code> or the <code className="text-violet-300">X-Api-Key</code> header.
      </p>

      <form onSubmit={create} className="flex gap-3 mb-6">
        <input className="input max-w-xs" placeholder="Key name (e.g. production)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0"><Plus size={15} /> Create key</button>
      </form>

      {justCreated && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="card p-4 mb-6 border-violet-700/50">
          <div className="text-sm text-zinc-300 mb-1">Key created — copy it now:</div>
          <code className="text-violet-300 text-sm select-all">{justCreated.key}</code>
        </motion.div>
      )}

      <div className="card p-5 overflow-x-auto">
        {keys.length === 0 ? (
          <div className="text-zinc-600 text-sm py-6 text-center">No keys yet — create your first one above.</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Key</th>
                <th className="pb-2 pr-4 font-medium">Rate/min</th>
                <th className="pb-2 pr-4 font-medium">Daily quota</th>
                <th className="pb-2 pr-4 font-medium">Usage</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => <KeyRow key={k.id} k={k} onChange={load} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
