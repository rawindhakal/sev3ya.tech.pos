'use client';

// Small inline spinner for buttons/inline loading states — inherits the
// current text color so it works on any button variant (primary/ghost/danger).
export default function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
