'use client';

import { useEffect, useState } from 'react';

// Dark/light toggle for the back-office (spec §3.2). Persists to localStorage
// and flips the `dark` class on <html>.
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('cakezake-theme');
    const isDark = stored === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
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
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {dark ? '☀️ Light mode' : '🌙 Dark mode'}
    </button>
  );
}
