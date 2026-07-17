'use client';

import { useEffect, useRef, useState } from 'react';
import { Space_Grotesk, DM_Sans } from 'next/font/google';
import { api, formatMoney } from '@/lib/api';

// Marketing home page shown on the bare s3vya.tech domain to signed-out
// visitors. Restaurant staff/platform admins reach their own sign-in via the
// "Sign in" button — this page never gates data behind auth.

const heading = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-heading' });
const body = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body' });

interface Plan {
  id: string; code: string; name: string; priceMonthlyCents: number; priceYearlyCents: number;
  maxEmployees: number; maxItems: number; features?: string[] | null;
}

const FEATURES: { title: string; desc: string; icon: React.ReactNode }[] = [
  {
    title: 'POS, KDS & Waiter Panel',
    desc: 'Fast billing, live kitchen display, and a mobile waiter app that stay in sync to the second — even on a shaky connection.',
    icon: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M14 8H8" /><path d="M16 12H8" /><path d="M13 16H8" /></>,
  },
  {
    title: 'Isolated tenant databases',
    desc: 'Every restaurant on s3vyaPOS gets its own private database. Your data never sits in the same table as anyone else\'s.',
    icon: <><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></>,
  },
  {
    title: 'Nepali fiscal year, built in',
    desc: 'Shrawan 1 to Ashadh-end fiscal windows, per-FY invoice numbering, and IRD-ready tax reports — no spreadsheet gymnastics.',
    icon: <><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>,
  },
  {
    title: 'Inventory & purchasing',
    desc: 'Recipes tied to stock, supplier purchase orders, and automatic stock movements every time an item sells.',
    icon: <><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" /></>,
  },
  {
    title: 'Full accounting & MIS',
    desc: 'Journals, ledgers, trial balance, day/sales/cash books, and IRD/CBMS sync — the back office an accountant will actually trust.',
    icon: <><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>,
  },
  {
    title: 'Fingerprint attendance & payroll',
    desc: 'ZKTeco device support with automatic payroll calculation — clock-ins turn into salary math without anyone touching a calculator.',
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  },
];

const STEPS = [
  { n: '01', title: 'We provision your restaurant', desc: 'A fresh, fully isolated database is created for you in seconds — your menu, your staff, your data, nothing shared.' },
  { n: '02', title: 'Turn on what you need', desc: 'Toggle modules like reservations, inventory, or full accounting on or off per your plan, any time.' },
  { n: '03', title: 'Go live at your own address', desc: 'Your restaurant gets its own subdomain (yourname.s3vya.tech) and the desktop till app for the counter.' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Is my restaurant\'s data really separate from other restaurants?', a: 'Yes — every restaurant runs on its own dedicated database, not shared rows in one giant table. Nothing you enter is ever visible to another tenant.' },
  { q: 'Does it work if the internet drops?', a: 'The POS is offline-first: sales keep working and sync automatically the moment the connection returns.' },
  { q: 'Is the Nepali fiscal year actually correct, not just BS dates?', a: 'Yes — invoice numbering resets and reports follow the real Shrawan 1 → Ashadh-end window, not a generic January–December year.' },
  { q: 'Can I change my plan or turn features on later?', a: 'Yes — plans, feature modules and every setting can be changed at any time without touching your data.' },
];

export default function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const featuresRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Plan[]>('/public/plans').then(setPlans).catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={`${heading.variable} ${body.variable} min-h-dvh overflow-x-hidden bg-[#08050C] text-white`} style={{ fontFamily: 'var(--font-body)' }}>
      {/* Ambient aurora background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[36rem] w-[36rem] rounded-full bg-fuchsia-600/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[32rem] w-[32rem] rounded-full bg-violet-600/25 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] bg-[length:28px_28px]" />
      </div>

      {/* Nav */}
      <header className={`sticky top-0 z-40 transition-colors duration-300 ${scrolled ? 'border-b border-white/10 bg-[#08050C]/80 backdrop-blur-xl' : 'border-b border-transparent'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 text-sm font-bold" style={{ fontFamily: 'var(--font-heading)' }}>s</span>
            <span className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>s3vya<span className="text-fuchsia-400">POS</span></span>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium text-white/70 md:flex">
            <button onClick={() => scrollTo(featuresRef)} className="cursor-pointer transition-colors hover:text-white">Features</button>
            <button onClick={() => scrollTo(pricingRef)} className="cursor-pointer transition-colors hover:text-white">Pricing</button>
          </nav>
          <button
            onClick={onSignIn}
            className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
          >
            Sign in
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto flex max-w-7xl flex-col items-center px-5 pb-20 pt-16 text-center sm:px-8 sm:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70 backdrop-blur-md">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Built for Nepali restaurants — fiscal year, IRD & VAT included
        </div>
        <h1
          className="max-w-4xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Run every table, tab, and
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-300 bg-clip-text text-transparent"> till</span> from one system
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg text-white/60 sm:text-xl">
          A complete restaurant platform — POS, kitchen display, inventory, accounting and staff payroll — with your own private database and Nepal&apos;s fiscal calendar built in from day one.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onSignIn}
            className="cursor-pointer rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-7 py-3.5 text-sm font-bold text-white shadow-[0_0_40px_-8px_rgba(217,70,239,0.6)] transition-transform duration-200 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
          >
            Sign in to your restaurant
          </button>
          <button
            onClick={() => scrollTo(pricingRef)}
            className="cursor-pointer rounded-full border border-white/15 px-7 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-white/5"
          >
            See pricing
          </button>
        </div>

        {/* Floating glass dashboard mockup */}
        <div className="relative mt-16 w-full max-w-4xl">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-r from-fuchsia-600/20 via-violet-600/20 to-cyan-500/20 blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-3 text-xs text-white/40">cakezake.s3vya.tech/pos</span>
            </div>
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
              {[
                { label: "Today's sales", value: 'Rs 84,320', trend: '+12.4%' },
                { label: 'Open tables', value: '7 / 14', trend: 'live' },
                { label: 'Fiscal year', value: '2083/84', trend: 'Shrawan 1' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left">
                  <div className="text-xs text-white/40">{s.label}</div>
                  <div className="mt-1 text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{s.value}</div>
                  <div className="mt-1 text-xs font-medium text-emerald-400">{s.trend}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-px bg-white/5 sm:grid-cols-4">
              {['KOT #128', 'KOT #129', 'KOT #130', 'KOT #131'].map((k, i) => (
                <div key={k} className="bg-[#0c0812] p-3 text-left">
                  <div className="text-[11px] text-white/40">{k}</div>
                  <div className="mt-1 text-xs font-semibold text-white/80">{i === 3 ? 'Preparing' : 'Ready'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-white/5 bg-white/[0.02] py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 text-xs font-medium uppercase tracking-wider text-white/40 sm:px-8">
          <span>Isolated tenant databases</span>
          <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
          <span>Offline-first POS</span>
          <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
          <span>IRD &amp; CBMS sync</span>
          <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
          <span>ZKTeco fingerprint payroll</span>
          <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
          <span>Nepali BS fiscal year</span>
        </div>
      </section>

      {/* Features */}
      <section ref={featuresRef} id="features" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-heading)' }}>
            Everything a modern restaurant needs, nothing it doesn&apos;t
          </h2>
          <p className="mt-4 text-white/55">Turn modules on as you grow. Every restaurant starts on the same solid core.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-fuchsia-400/30 hover:bg-white/[0.06]"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-600/20 text-fuchsia-300 transition-colors group-hover:text-fuchsia-200">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{f.icon}</svg>
              </div>
              <h3 className="mb-1.5 text-base font-bold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-white/5 bg-white/[0.015] py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-heading)' }}>Live in three steps</h2>
            <p className="mt-4 text-white/55">No migrations to babysit, no IT project — your restaurant is isolated and ready fast.</p>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="absolute left-6 top-14 hidden h-px w-[calc(100%-1.5rem)] bg-gradient-to-r from-fuchsia-500/40 to-transparent sm:block" aria-hidden />
                )}
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 text-sm font-bold text-fuchsia-300" style={{ fontFamily: 'var(--font-heading)' }}>
                  {s.n}
                </div>
                <h3 className="mb-2 text-lg font-bold text-white">{s.title}</h3>
                <p className="text-sm leading-relaxed text-white/55">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section ref={pricingRef} id="pricing" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-heading)' }}>Simple, transparent pricing</h2>
          <p className="mt-4 text-white/55">Pay monthly by cash or direct bank transfer. Switch plans any time.</p>
        </div>
        {plans.length === 0 ? (
          <div className="text-center text-sm text-white/40">Loading plans…</div>
        ) : (
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
            {plans.map((p, i) => {
              const popular = i === 1;
              return (
                <div
                  key={p.id}
                  className={`relative rounded-2xl border p-7 backdrop-blur-md transition-transform duration-300 hover:-translate-y-1 ${
                    popular
                      ? 'border-fuchsia-400/40 bg-gradient-to-b from-fuchsia-500/10 to-violet-600/5 shadow-[0_0_60px_-15px_rgba(217,70,239,0.4)]'
                      : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-white">{p.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>{formatMoney(p.priceMonthlyCents)}</span>
                    <span className="text-sm text-white/40">/mo</span>
                  </div>
                  <div className="mt-1 text-xs text-white/40">up to {p.maxEmployees} staff · {p.maxItems} menu items</div>
                  <ul className="mt-6 space-y-2.5">
                    {(p.features ?? []).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={onSignIn}
                    className={`mt-7 w-full cursor-pointer rounded-full py-2.5 text-sm font-bold transition-all ${
                      popular
                        ? 'bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white hover:scale-[1.02]'
                        : 'border border-white/15 text-white hover:bg-white/5'
                    }`}
                  >
                    Get started
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="border-t border-white/5 bg-white/[0.015] py-24">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-heading)' }}>
            Questions, answered
          </h2>
          <div className="space-y-3">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left text-sm font-semibold text-white"
                    aria-expanded={open}
                  >
                    {item.q}
                    <svg className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {open && <p className="px-5 pb-4 text-sm leading-relaxed text-white/55">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative mx-auto max-w-5xl px-5 py-24 text-center sm:px-8">
        <div aria-hidden className="absolute inset-x-0 top-1/2 -z-10 mx-auto h-64 w-64 -translate-y-1/2 rounded-full bg-fuchsia-600/25 blur-[100px]" />
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-heading)' }}>
          Ready to run your restaurant on s3vyaPOS?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/55">Sign in if you&apos;re already set up, or reach out and we&apos;ll get your restaurant provisioned with its own database.</p>
        <button
          onClick={onSignIn}
          className="mt-8 cursor-pointer rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_0_40px_-8px_rgba(217,70,239,0.6)] transition-transform duration-200 hover:scale-[1.03]"
        >
          Sign in →
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/60">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 text-[11px] font-bold text-white">s</span>
            s3vyaPOS
          </div>
          <p className="text-xs text-white/30">© {new Date().getFullYear()} s3vya. Restaurant platform for Nepal.</p>
        </div>
      </footer>
    </div>
  );
}
