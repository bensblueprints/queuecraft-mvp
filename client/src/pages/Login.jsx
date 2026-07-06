import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { api } from '../api.js';
import { Button, Input } from '../ui.jsx';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="w-full max-w-sm bg-panel border border-line rounded-2xl p-8"
      >
        <div className="w-12 h-12 rounded-xl bg-accent grid place-items-center font-black text-white text-xl mb-5">Q</div>
        <h1 className="text-xl font-bold mb-1">Queuecraft Admin</h1>
        <p className="text-sm text-zinc-500 mb-6">Enter your admin password to continue.</p>
        <Input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <Button type="submit" disabled={busy || !password} className="w-full justify-center mt-4">
          <Lock size={15} /> {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </motion.form>
    </div>
  );
}
