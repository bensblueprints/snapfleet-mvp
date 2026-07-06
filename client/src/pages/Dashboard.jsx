import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Zap, Database, HardDrive, Chrome } from 'lucide-react';
import { api } from '../api.js';

function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function Tile({ icon: Icon, label, value, sub }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wide mb-2">
        <Icon size={14} /> {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </motion.div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);

  async function load() {
    try {
      const [s, h] = await Promise.all([api.get('/api/stats'), api.get('/api/health')]);
      setStats(s);
      setHealth(h);
    } catch { /* transient */ }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return <div className="text-zinc-500">Loading…</div>;

  const maxReq = Math.max(1, ...stats.hourly.map((h) => h.requests));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-zinc-500 text-sm mb-6">Last 24 hours of screenshot activity.</p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Tile icon={Activity} label="Requests (24h)" value={stats.requests_24h} />
        <Tile icon={Zap} label="Cache hit rate" value={`${Math.round(stats.cache_hit_rate * 100)}%`} />
        <Tile icon={Database} label="Avg render" value={`${stats.avg_render_ms} ms`} sub="cache misses only" />
        <Tile icon={HardDrive} label="Stored" value={stats.shots_stored} sub={fmtBytes(stats.bytes_stored)} />
        <Tile
          icon={Chrome}
          label="Browser"
          value={stats.browser}
          sub={health ? `${health.active_jobs} active · ${health.queued_jobs} queued` : ''}
        />
      </div>

      <div className="card p-5">
        <div className="text-sm font-medium text-zinc-300 mb-4">Requests per hour</div>
        {stats.hourly.length === 0 ? (
          <div className="text-zinc-600 text-sm py-8 text-center">
            No requests yet — head to the Playground to take your first screenshot.
          </div>
        ) : (
          <div className="flex items-end gap-1 h-36">
            {stats.hourly.map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full rounded-t bg-violet-600/70 group-hover:bg-violet-500 transition-colors min-h-[3px]"
                  style={{ height: `${(h.requests / maxReq) * 100}%` }}
                />
                <div className="absolute -top-7 hidden group-hover:block bg-zinc-800 text-xs px-2 py-0.5 rounded whitespace-nowrap">
                  {h.hour.slice(11)}:00 — {h.requests} req ({h.hits} cached)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
