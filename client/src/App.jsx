import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, LayoutDashboard, FlaskConical, Images, KeyRound, Settings as SettingsIcon,
  BookOpen, LogOut, Lock
} from 'lucide-react';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Playground from './pages/Playground.jsx';
import Gallery from './pages/Gallery.jsx';
import Keys from './pages/Keys.jsx';
import Settings from './pages/Settings.jsx';
import Docs from './pages/Docs.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, el: Dashboard },
  { id: 'playground', label: 'Playground', icon: FlaskConical, el: Playground },
  { id: 'gallery', label: 'Gallery', icon: Images, el: Gallery },
  { id: 'keys', label: 'API Keys', icon: KeyRound, el: Keys },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, el: Settings },
  { id: 'docs', label: 'API Docs', icon: BookOpen, el: Docs }
];

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/login', { password });
      onLogin();
    } catch (e2) {
      setError(e2.status === 401 ? 'Wrong password' : e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="card p-8 w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-violet-600 rounded-xl p-2.5"><Camera size={22} /></div>
          <div>
            <h1 className="text-xl font-bold">Snapfleet</h1>
            <p className="text-xs text-zinc-500">Self-hosted screenshot API</p>
          </div>
        </div>
        <label className="label">Admin password</label>
        <input
          className="input mb-3"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="••••••••"
        />
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button className="btn-primary w-full justify-center" disabled={busy}>
          <Lock size={15} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </motion.form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking
  const [page, setPage] = useState('dashboard');

  useEffect(() => {
    api.get('/api/stats')
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</div>;
  }
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const Active = NAV.find((n) => n.id === page)?.el || Dashboard;

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-950 p-4 flex flex-col sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="bg-violet-600 rounded-lg p-2"><Camera size={18} /></div>
          <div>
            <div className="font-bold leading-tight">Snapfleet</div>
            <div className="text-[10px] text-zinc-500 leading-tight">Screenshot API</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left cursor-pointer ${
                page === n.id ? 'bg-violet-600/15 text-violet-300' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <n.icon size={16} /> {n.label}
            </button>
          ))}
        </nav>
        <button
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 transition-colors cursor-pointer"
          onClick={async () => { await api.post('/api/logout', {}); setAuthed(false); }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <main className="flex-1 min-w-0 p-8 max-w-6xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <Active />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
