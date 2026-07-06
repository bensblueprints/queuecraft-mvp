import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { ListOrdered, Settings, LogOut, Loader2 } from 'lucide-react';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Waitlist from './pages/Waitlist.jsx';
import Smtp from './pages/Smtp.jsx';

export default function App() {
  const [authed, setAuthed] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.me().then((d) => setAuthed(d.authed)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-line p-5 flex flex-col gap-1 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 mb-6 px-2">
          <div className="w-8 h-8 rounded-lg bg-accent grid place-items-center font-black text-white">Q</div>
          <div>
            <div className="font-bold leading-none">Queuecraft</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Waitlist + referrals</div>
          </div>
        </div>
        <NavItem to="/" icon={<ListOrdered size={16} />}>Waitlists</NavItem>
        <NavItem to="/settings" icon={<Settings size={16} />}>SMTP Settings</NavItem>
        <div className="flex-1" />
        <button
          onClick={() => api.logout().then(() => { setAuthed(false); navigate('/'); })}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-200 hover:bg-panel transition cursor-pointer"
        >
          <LogOut size={16} /> Log out
        </button>
      </aside>
      <main className="flex-1 p-8 max-w-6xl">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/waitlists/:id" element={<Waitlist />} />
          <Route path="/settings" element={<Smtp />} />
        </Routes>
      </main>
    </div>
  );
}

function NavItem({ to, icon, children }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition ${
          isActive ? 'bg-panel text-white border border-line' : 'text-zinc-400 hover:text-zinc-200 hover:bg-panel'
        }`
      }
    >
      {icon} {children}
    </NavLink>
  );
}
