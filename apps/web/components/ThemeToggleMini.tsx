'use client';

import { useEffect, useState } from 'react';

// Compact dark/light toggle for the full-screen terminals (POS, waiter). Shares
// the same `cakezake-theme` storage + `.dark` class as the back-office toggle.
export default function ThemeToggleMini({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('cakezake-theme', next ? 'dark' : 'light');
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`rounded-md bg-[var(--pos-surface)] px-2 py-1 text-[11px] text-[var(--pos-text-60)] hover:bg-[var(--pos-surface-hover)] ${className}`}
    >
      {dark ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}
