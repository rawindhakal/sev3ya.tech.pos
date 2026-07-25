'use client';

// Public gateway-redirect bridge — scanned from the POS's "Pay via Gateway"
// QR (or opened directly on the customer's phone). Kicks off the real
// eSewa/Khalti/FonePay session for this order, then hands off to the
// provider (form POST for eSewa, plain redirect for Khalti/FonePay).
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

type Provider = 'esewa' | 'khalti' | 'fonepay';

export default function PayRedirectPage() {
  const params = useParams<{ provider: string; orderId: string }>();
  const provider = params.provider as Provider;
  const orderId = params.orderId;
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [esewaFields, setEsewaFields] = useState<Record<string, string> | null>(null);
  const [esewaUrl, setEsewaUrl] = useState('');

  useEffect(() => {
    const origin = window.location.origin;
    const returnUrl = `${origin}/pay/callback/${provider}/${orderId}`;
    (async () => {
      try {
        if (provider === 'esewa') {
          const res = await api.post<{ formUrl: string; fields: Record<string, string> }>('/payments-gateway/esewa/initiate', {
            orderId, returnUrl, failureUrl: returnUrl,
          });
          setEsewaUrl(res.formUrl);
          setEsewaFields(res.fields);
        } else if (provider === 'khalti') {
          const res = await api.post<{ payment_url: string }>('/payments-gateway/khalti/initiate', {
            orderId, returnUrl, websiteUrl: origin,
          });
          window.location.href = res.payment_url;
        } else if (provider === 'fonepay') {
          const res = await api.post<{ redirectUrl: string }>('/payments-gateway/fonepay/initiate', { orderId, returnUrl });
          window.location.href = res.redirectUrl;
        } else {
          setError('Unknown payment provider');
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [provider, orderId]);

  // eSewa needs an actual form POST — submit the moment fields arrive.
  useEffect(() => {
    if (esewaFields && formRef.current) formRef.current.submit();
  }, [esewaFields]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-slate-50 p-8 text-center">
        <div className="text-4xl">⚠️</div>
        <p className="text-slate-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      <p className="text-slate-500">Redirecting to {provider}…</p>
      {esewaFields && esewaUrl && (
        <form ref={formRef} action={esewaUrl} method="POST" className="hidden">
          {Object.entries(esewaFields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        </form>
      )}
    </div>
  );
}
