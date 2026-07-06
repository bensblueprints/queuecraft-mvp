import React, { useEffect, useState } from 'react';
import { Mail, Send, Check } from 'lucide-react';
import { api } from '../api.js';
import { Card, Button, Input, Toggle, Badge } from '../ui.jsx';

export default function Smtp() {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.smtp().then(setForm); }, []);
  if (!form) return <p className="text-zinc-500 text-sm">Loading…</p>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const r = await api.saveSmtp(form);
    setForm((f) => ({ ...f, configured: r.configured }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const test = async () => {
    setBusy(true); setTestResult(null);
    try {
      await api.saveSmtp(form);
      await api.testSmtp(testTo);
      setTestResult({ ok: true });
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">SMTP Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Bring your own SMTP — your emails, your deliverability, your data.</p>
        </div>
        {form.configured ? <Badge tone="green"><Check size={11} /> configured</Badge> : <Badge>not configured</Badge>}
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="SMTP host" value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="smtp.mailgun.org" />
          <Input label="Port" type="number" value={form.port} onChange={(e) => set('port', e.target.value)} />
          <Input label="Username" value={form.user} onChange={(e) => set('user', e.target.value)} placeholder="postmaster@yourdomain.com" />
          <Input label="Password" type="password" value={form.pass} onChange={(e) => set('pass', e.target.value)} />
          <Input label="From address" value={form.from} onChange={(e) => set('from', e.target.value)} placeholder="waitlist@yourdomain.com" />
          <div className="flex items-end pb-1">
            <Toggle label="Use TLS (secure)" checked={form.secure} onChange={(v) => set('secure', v)} />
          </div>
        </div>
        <div className="border-t border-line mt-6 pt-5 space-y-4">
          <Toggle label="Block disposable email domains" checked={form.blocklist_enabled} onChange={(v) => set('blocklist_enabled', v)} />
          <Toggle label="Normalize Gmail addresses (strip dots / +tags for dedupe)" checked={form.gmail_normalize} onChange={(v) => set('gmail_normalize', v)} />
        </div>
        <div className="mt-6">
          <Button onClick={save}>{saved ? <><Check size={15} /> Saved</> : 'Save settings'}</Button>
        </div>
      </Card>

      <Card className="mt-5">
        <h2 className="font-bold mb-1 flex items-center gap-2"><Mail size={16} /> Test send</h2>
        <p className="text-xs text-zinc-500 mb-4">Saves current settings, then sends a test email.</p>
        <div className="flex gap-3">
          <div className="flex-1"><Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></div>
          <Button onClick={test} disabled={busy || !testTo}><Send size={15} /> {busy ? 'Sending…' : 'Send test'}</Button>
        </div>
        {testResult?.ok && <p className="text-emerald-400 text-sm mt-3">Test email sent — check your inbox.</p>}
        {testResult && !testResult.ok && <p className="text-red-400 text-sm mt-3">{testResult.error}</p>}
      </Card>
    </div>
  );
}
