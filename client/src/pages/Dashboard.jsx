import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, BadgeCheck, Trophy, ExternalLink } from 'lucide-react';
import { api } from '../api.js';
import { Card, Button, Input } from '../ui.jsx';

export default function Dashboard() {
  const [waitlists, setWaitlists] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');

  const load = () => api.waitlists().then(setWaitlists).catch(() => setWaitlists([]));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createWaitlist({ name, slug });
      setShowNew(false);
      setName('');
      setSlug('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Waitlists</h1>
          <p className="text-sm text-zinc-500 mt-1">Create a waitlist, embed the widget, watch it grow.</p>
        </div>
        <Button onClick={() => setShowNew(!showNew)}><Plus size={16} /> New waitlist</Button>
      </div>

      {showNew && (
        <Card className="mb-6">
          <form onSubmit={create} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1"><Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Product Beta" required /></div>
            <div className="flex-1"><Input label="Slug (optional)" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-product" /></div>
            <Button type="submit">Create</Button>
          </form>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </Card>
      )}

      {waitlists === null ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : waitlists.length === 0 ? (
        <Card className="text-center py-14">
          <Users className="mx-auto text-zinc-600 mb-3" size={32} />
          <p className="text-zinc-400 font-medium">No waitlists yet</p>
          <p className="text-zinc-600 text-sm mt-1">Create your first waitlist to get a hosted page + embed widget.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {waitlists.map((w) => (
            <Card key={w.id} className="hover:border-accent/40 transition">
              <Link to={`/waitlists/${w.id}`} className="block">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-bold text-lg">{w.name}</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">/w/{w.slug}</p>
                  </div>
                  <a
                    href={`/w/${w.slug}`}
                    target="_blank"
                    rel="noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="text-zinc-500 hover:text-accent transition"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-5">
                  <Stat icon={<Users size={14} />} label="Signups" value={w.stats.signups} />
                  <Stat
                    icon={<BadgeCheck size={14} />}
                    label="Verified"
                    value={w.stats.signups ? `${Math.round((w.stats.verified / w.stats.signups) * 100)}%` : '—'}
                  />
                  <Stat
                    icon={<Trophy size={14} />}
                    label="Top referrer"
                    value={w.stats.topReferrer ? `${w.stats.topReferrer.refs}×` : '—'}
                    title={w.stats.topReferrer?.email}
                  />
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, title }) {
  return (
    <div className="bg-panel2 border border-line rounded-xl p-3" title={title}>
      <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]">{icon} {label}</div>
      <div className="font-bold mt-1 truncate">{value}</div>
    </div>
  );
}
