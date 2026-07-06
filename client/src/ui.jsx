import React from 'react';
import { motion } from 'framer-motion';

export function Card({ children, className = '', ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`bg-panel border border-line rounded-2xl p-6 ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-accent hover:brightness-110 text-white',
    ghost: 'bg-transparent border border-line hover:border-accent/60 text-zinc-200',
    danger: 'bg-transparent border border-line hover:border-red-500/60 hover:text-red-400 text-zinc-400'
  };
  return (
    <button
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</span>}
      <input
        className={`w-full bg-panel2 border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-accent transition ${className}`}
        {...props}
      />
    </label>
  );
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</span>}
      <textarea
        className={`w-full bg-panel2 border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-accent transition min-h-24 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
      <span className="text-sm text-zinc-300">{label}</span>
      <span
        onClick={() => onChange(!checked)}
        className={`w-10 h-[22px] rounded-full relative transition ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span
          className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[21px]' : 'left-[3px]'}`}
        />
      </span>
    </label>
  );
}

export function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'border-line text-zinc-400',
    green: 'border-emerald-500/40 text-emerald-400',
    accent: 'border-accent/40 text-accent-soft'
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${tones[tone]}`}>
      {children}
    </span>
  );
}
