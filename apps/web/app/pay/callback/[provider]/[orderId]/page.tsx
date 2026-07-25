'use client';

// Provider redirects here after the customer completes (or cancels) payment.
// Verifies with the provider's own API before marking the order paid — never
// trusts the redirect alone.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

type Provider = 'esewa' | 'khalti' | 'fonepay';
type Status = 'checking' | 'success' | 'failed';

export default function PayCallbackPage() {
  const params = useParams<{ provider: string; orderId: string }>();
  const provider = params.provider as Provider;
  const orderId = params.orderId;
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    (async () => {
      try {
        if (provider === 'esewa') {
          const data = qs.get('data');
          if (!data) throw new Error('Missing eSewa response');
          await api.post(`/payments-gateway/esewa/verify`, { orderId, data });
        } else if (provider === 'khalti') {
          const pidx = qs.get('pidx');
          if (!pidx) throw new Error('Missing Khalti reference');
          await api.post(`/payments-gateway/khalti/verify`, { orderId, pidx });
        } else if (provider === 'fonepay') {
          const prn = qs.get('PRN') ?? qs.get('prn');
          if (!prn) throw new Error('Missing FonePay reference');
          await api.post(`/payments-gateway/fonepay/verify`, { orderId, prn });
        } else {
          throw new Error('Unknown payment provider');
        }
        setStatus('success');
      } catch (e) {
        setStatus('failed');
        setMessage((e as Error).message);
      }
    })();
  }, [provider, orderId]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center">
      {status === 'checking' && (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-slate-500">Confirming your payment…</p>
        </>
      )}
      {status === 'success' && (
        <>
          <div className="text-5xl">✅</div>
          <p className="text-lg font-semibold text-slate-800">Payment received!</p>
          <p className="text-sm text-slate-500">You can close this page and return to the counter.</p>
        </>
      )}
      {status === 'failed' && (
        <>
          <div className="text-5xl">❌</div>
          <p className="text-lg font-semibold text-slate-800">Payment not confirmed</p>
          <p className="text-sm text-slate-500">{message || 'Please try again or pay at the counter.'}</p>
        </>
      )}
    </div>
  );
}
