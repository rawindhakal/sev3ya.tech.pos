import type { Metadata } from 'next';

// The waiter panel installs as its own PWA ("s3vyaPOS Waiter") that opens
// straight to /waiter on the handheld.
export const metadata: Metadata = {
  title: 's3vyaPOS Waiter',
  manifest: '/waiter.webmanifest',
};

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
