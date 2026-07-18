'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// In-app replacements for window.confirm / window.prompt / window.alert.
// These are plain async functions callable from anywhere (event handlers,
// services) — no hook needed — backed by a tiny pub-sub that <DialogHost/>
// (mounted once in AppShell) subscribes to and renders as a proper modal /
// toast instead of a native browser dialog (works in the Electron shell too).

interface ConfirmState {
  kind: 'confirm';
  message: string;
  title?: string;
  danger?: boolean;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}
interface PromptState {
  kind: 'prompt';
  message: string;
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  resolve: (value: string | null) => void;
}
export interface ToastItem { id: number; message: string; type: 'error' | 'success' | 'info'; }

type Listener = (s: { dialog: ConfirmState | PromptState | null; toasts: ToastItem[] }) => void;

let dialog: ConfirmState | PromptState | null = null;
let toasts: ToastItem[] = [];
let toastSeq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l({ dialog, toasts });
}

export function confirmDialog(
  message: string,
  opts?: { title?: string; danger?: boolean; confirmLabel?: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    dialog = { kind: 'confirm', message, resolve, ...opts };
    emit();
  });
}

export function promptDialog(
  message: string,
  defaultValue?: string,
  opts?: { title?: string; placeholder?: string; multiline?: boolean },
): Promise<string | null> {
  return new Promise((resolve) => {
    dialog = { kind: 'prompt', message, defaultValue, resolve, ...opts };
    emit();
  });
}

// Non-blocking toast — replaces window.alert(). Errors stay up longer.
export function notify(message: string, type: ToastItem['type'] = 'info') {
  const id = ++toastSeq;
  toasts = [...toasts, { id, message, type }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, type === 'error' ? 6000 : 3500);
}
function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function closeDialog(result: boolean | string | null) {
  const d = dialog;
  dialog = null;
  emit();
  if (!d) return;
  if (d.kind === 'confirm') d.resolve(result === true);
  else d.resolve(typeof result === 'string' ? result : null);
}

export default function DialogHost() {
  const [state, setState] = useState<{ dialog: ConfirmState | PromptState | null; toasts: ToastItem[] }>({ dialog: null, toasts: [] });
  const [draft, setDraft] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const l: Listener = (s) => setState(s);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  useEffect(() => {
    if (state.dialog?.kind === 'prompt') setDraft(state.dialog.defaultValue ?? '');
  }, [state.dialog]);

  if (!mounted) return null;
  const d = state.dialog;

  return createPortal(
    <>
      {d && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => closeDialog(d.kind === 'confirm' ? false : null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            {d.title && <h3 className="mb-2 text-base font-bold text-slate-900 dark:text-white">{d.title}</h3>}
            <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{d.message}</p>
            {d.kind === 'prompt' && (
              d.multiline ? (
                <textarea
                  className="input mt-3 min-h-20" autoFocus value={draft} placeholder={d.placeholder}
                  onChange={(e) => setDraft(e.target.value)}
                />
              ) : (
                <input
                  className="input mt-3" autoFocus value={draft} placeholder={d.placeholder}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && closeDialog(draft)}
                />
              )
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => closeDialog(d.kind === 'confirm' ? false : null)}>Cancel</button>
              {d.kind === 'confirm' ? (
                <button
                  className={d.danger ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700' : 'btn-primary'}
                  autoFocus
                  onClick={() => closeDialog(true)}
                >
                  {d.confirmLabel ?? 'Confirm'}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => closeDialog(draft)}>OK</button>
              )}
            </div>
          </div>
        </div>
      )}
      {state.toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-[110] flex -translate-x-1/2 flex-col gap-2">
          {state.toasts.map((t) => (
            <button
              key={t.id}
              onClick={() => dismissToast(t.id)}
              className={`max-w-md rounded-lg px-4 py-2.5 text-left text-sm font-medium shadow-lg ${
                t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'
              }`}
            >
              {t.message}
            </button>
          ))}
        </div>
      )}
    </>,
    document.body,
  );
}
