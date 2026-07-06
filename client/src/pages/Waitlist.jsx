import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Search, Download, Trash2, Send, BadgeCheck, Copy, Check,
  Users, Settings2, Megaphone, Code2, ExternalLink
} from 'lucide-react';
import { api } from '../api.js';
import { Card, Button, Input, Textarea, Toggle, Badge } from '../ui.jsx';

export default function Waitlist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [wl, setWl] = useState(null);
  const [tab, setTab] = useState('subscribers');

  const load = useCallback(() => api.waitlist(id).then(setWl).catch(() => navigate('/')), [id, navigate]);
  useEffect(() => { load(); }, [load]);

  if (!wl) return <p className="text-zinc-500 text-sm">Loading…</p>;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 transition mb-4">
        <ArrowLeft size={15} /> All waitlists
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{wl.name}</h1>
          <a href={`/w/${wl.slug}`} target="_blank" rel="noopener" className="text-sm text-accent-soft hover:underline inline-flex items-center gap-1 mt-1">
            /w/{wl.slug} <ExternalLink size={13} />
          </a>
        </div>
        <div className="flex gap-2 text-sm text-zinc-500">
          <Badge>{wl.stats.signups} signups</Badge>
          <Badge tone="green">{wl.stats.verified} verified</Badge>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-line">
        <Tab active={tab === 'subscribers'} onClick={() => setTab('subscribers')} icon={<Users size={15} />}>Subscribers</Tab>
        <Tab active={tab === 'broadcast'} onClick={() => setTab('broadcast')} icon={<Megaphone size={15} />}>Broadcast</Tab>
        <Tab active={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings2 size={15} />}>Settings</Tab>
        <Tab active={tab === 'embed'} onClick={() => setTab('embed')} icon={<Code2 size={15} />}>Embed</Tab>
      </div>

      {tab === 'subscribers' && <Subscribers wl={wl} />}
      {tab === 'broadcast' && <Broadcast wl={wl} />}
      {tab === 'settings' && <SettingsTab wl={wl} onSaved={load} onDeleted={() => navigate('/')} />}
      {tab === 'embed' && <Embed wl={wl} />}
    </div>
  );
}

function Tab({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition cursor-pointer ${
        active ? 'border-accent text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {icon} {children}
    </button>
  );
}

function Subscribers({ wl }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    api.subscribers(wl.id, search, page).then(setData).catch(() => {});
  }, [wl.id, search, page]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const del = async (id) => {
    if (!confirm('Delete this subscriber?')) return;
    await api.deleteSubscriber(id);
    load();
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-line">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="w-full bg-panel2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Search email or name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex-1" />
        <a href={`/api/waitlists/${wl.id}/export.csv`} download>
          <Button variant="ghost"><Download size={15} /> Export CSV</Button>
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 border-b border-line">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Referrals</th>
              <th className="px-4 py-3">Points</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data?.subscribers.map((s) => (
              <tr key={s.id} className="border-b border-line/50 hover:bg-panel2/50">
                <td className="px-4 py-3 font-bold text-accent-soft">#{s.position}</td>
                <td className="px-4 py-3">{s.email}{s.ref_source && <div className="text-[10px] text-zinc-600">via {s.ref_source}</div>}</td>
                <td className="px-4 py-3 text-zinc-400">{s.name || '—'}</td>
                <td className="px-4 py-3">{s.referral_count}</td>
                <td className="px-4 py-3">{s.points}</td>
                <td className="px-4 py-3">
                  {s.verified
                    ? <Badge tone="green"><BadgeCheck size={11} /> verified</Badge>
                    : <Badge>pending</Badge>}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => del(s.id)} className="text-zinc-600 hover:text-red-400 transition cursor-pointer"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {data && data.subscribers.length === 0 && (
              <tr><td colSpan="8" className="px-4 py-10 text-center text-zinc-600">No subscribers yet — share /w/{wl.slug}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > data.perPage && (
        <div className="flex items-center justify-between p-4 text-sm text-zinc-500">
          <span>{data.total} subscribers</span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button variant="ghost" disabled={page * data.perPage >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Broadcast({ wl }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Hey {{name}},\n\nBig news — we just launched! You were #{{position}} in line.\n\nThanks for waiting,\nThe team');
  const [audience, setAudience] = useState('verified');
  const [topN, setTopN] = useState(100);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await api.broadcast(wl.id, { subject, body, audience, topN });
      setResult(r.queued);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="max-w-2xl">
      <h2 className="font-bold mb-1">Broadcast email</h2>
      <p className="text-xs text-zinc-500 mb-5">
        Placeholders: <code className="text-accent-soft">{'{{name}}'}</code>, <code className="text-accent-soft">{'{{position}}'}</code>, <code className="text-accent-soft">{'{{total}}'}</code>, <code className="text-accent-soft">{'{{referral_link}}'}</code>
      </p>
      <div className="space-y-4">
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="We're live! 🚀" />
        <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
        <div className="flex gap-3 items-end">
          <label className="block flex-1">
            <span className="block text-xs font-medium text-zinc-400 mb-1.5">Audience</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full bg-panel2 border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="verified">Verified only</option>
              <option value="all">Everyone</option>
              <option value="top">Top N by position</option>
            </select>
          </label>
          {audience === 'top' && (
            <div className="w-28"><Input label="N" type="number" min="1" value={topN} onChange={(e) => setTopN(e.target.value)} /></div>
          )}
        </div>
        <Button onClick={send} disabled={busy || !subject || !body}>
          <Send size={15} /> {busy ? 'Queuing…' : 'Queue broadcast'}
        </Button>
        {result != null && <p className="text-emerald-400 text-sm">Queued {result} emails — they'll send through your SMTP in the background.</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </Card>
  );
}

function SettingsTab({ wl, onSaved, onDeleted }) {
  let theme = {};
  try { theme = JSON.parse(wl.theme_json || '{}'); } catch { /* noop */ }
  const [form, setForm] = useState({
    name: wl.name,
    headline: wl.headline,
    description: wl.description,
    referral_boost: wl.referral_boost,
    signup_cap: wl.signup_cap,
    require_verify: !!wl.require_verify,
    notify_moveup: !!wl.notify_moveup,
    mode: theme.mode || 'dark',
    accent: theme.accent || '#7c5cff'
  });
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    await api.updateWaitlist(wl.id, {
      name: form.name,
      headline: form.headline,
      description: form.description,
      referral_boost: form.referral_boost,
      signup_cap: form.signup_cap,
      require_verify: form.require_verify,
      notify_moveup: form.notify_moveup,
      theme: { mode: form.mode, accent: form.accent }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  };

  const del = async () => {
    if (!confirm(`Delete "${wl.name}" and ALL its subscribers? This cannot be undone.`)) return;
    await api.deleteWaitlist(wl.id);
    onDeleted();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2 max-w-4xl">
      <Card>
        <h2 className="font-bold mb-4">Copy</h2>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Headline" value={form.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Get early access to…" />
          <Textarea label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </Card>
      <Card>
        <h2 className="font-bold mb-4">Referrals & rules</h2>
        <div className="space-y-4">
          <Input label="Positions gained per verified referral" type="number" min="0" value={form.referral_boost} onChange={(e) => set('referral_boost', e.target.value)} />
          <Input label="Signup cap (0 = unlimited)" type="number" min="0" value={form.signup_cap} onChange={(e) => set('signup_cap', e.target.value)} />
          <Toggle label="Require email verification" checked={form.require_verify} onChange={(v) => set('require_verify', v)} />
          <Toggle label='Send "you moved up" emails' checked={form.notify_moveup} onChange={(v) => set('notify_moveup', v)} />
        </div>
      </Card>
      <Card>
        <h2 className="font-bold mb-4">Widget theme</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-zinc-400 mb-1.5">Mode</span>
            <select value={form.mode} onChange={(e) => set('mode', e.target.value)} className="w-full bg-panel2 border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-accent">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-zinc-400 mb-1.5">Accent color</span>
            <div className="flex items-center gap-3">
              <input type="color" value={form.accent} onChange={(e) => set('accent', e.target.value)} className="w-10 h-10 rounded-lg border border-line bg-panel2 cursor-pointer" />
              <span className="text-sm text-zinc-400 font-mono">{form.accent}</span>
            </div>
          </label>
        </div>
      </Card>
      <Card>
        <h2 className="font-bold mb-4">Danger zone</h2>
        <p className="text-xs text-zinc-500 mb-4">Deleting a waitlist removes all subscribers and referral history.</p>
        <Button variant="danger" onClick={del}><Trash2 size={15} /> Delete waitlist</Button>
      </Card>
      <div className="lg:col-span-2 flex items-center gap-3">
        <Button onClick={save}>{saved ? <><Check size={15} /> Saved</> : 'Save changes'}</Button>
      </div>
    </div>
  );
}

function Embed({ wl }) {
  const [copied, setCopied] = useState('');
  const origin = window.location.origin;
  const snippet = `<script src="${origin}/embed.js" data-waitlist="${wl.slug}"><\/script>`;
  const hosted = `${origin}/w/${wl.slug}`;

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <h2 className="font-bold mb-1">Embed widget</h2>
        <p className="text-xs text-zinc-500 mb-4">Paste this anywhere in your site's HTML. Styles are isolated in a shadow DOM.</p>
        <div className="bg-panel2 border border-line rounded-xl p-4 font-mono text-xs text-zinc-300 break-all">{snippet}</div>
        <Button variant="ghost" className="mt-3" onClick={() => copy(snippet, 'snippet')}>
          {copied === 'snippet' ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy snippet</>}
        </Button>
      </Card>
      <Card>
        <h2 className="font-bold mb-1">Hosted page</h2>
        <p className="text-xs text-zinc-500 mb-4">No website yet? Link straight to your hosted signup page.</p>
        <div className="bg-panel2 border border-line rounded-xl p-4 font-mono text-xs text-zinc-300 break-all">{hosted}</div>
        <div className="flex gap-2 mt-3">
          <Button variant="ghost" onClick={() => copy(hosted, 'hosted')}>
            {copied === 'hosted' ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy URL</>}
          </Button>
          <a href={hosted} target="_blank" rel="noopener"><Button variant="ghost"><ExternalLink size={15} /> Open</Button></a>
        </div>
      </Card>
    </div>
  );
}
