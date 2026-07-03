import type { PaymentMethod } from './types';

// The tenders this cafe accepts (Nepal). `credit` = pay-later / house account.
export const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  color: string;
}[] = [
  { value: 'CASH', label: 'Cash', color: 'bg-emerald-500' },
  { value: 'FONEPAY', label: 'FonePay', color: 'bg-red-500' },
  { value: 'ESEWA', label: 'eSewa', color: 'bg-green-600' },
  { value: 'KHALTI', label: 'Khalti', color: 'bg-purple-600' },
  { value: 'BANK', label: 'Bank', color: 'bg-blue-600' },
  { value: 'CARD', label: 'Card', color: 'bg-indigo-500' },
  { value: 'CREDIT', label: 'Credit', color: 'bg-amber-500' },
  { value: 'OFFLINE', label: 'Offline', color: 'bg-slate-400' },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> =
  Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<
    PaymentMethod,
    string
  >;

export const PAYMENT_METHOD_COLOR: Record<PaymentMethod, string> =
  Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.color])) as Record<
    PaymentMethod,
    string
  >;
