'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

// Full-screen terminals (POS, KDS, waiter handheld) render without the
// back-office sidebar; everything else gets the admin shell.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '';
  const fullscreen = path === '/pos' || path === '/kds' || path.startsWith('/waiter');
  if (fullscreen) return <main className="h-screen overflow-hidden">{children}</main>;
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
