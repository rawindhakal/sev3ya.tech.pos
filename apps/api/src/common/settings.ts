// Central business settings, read from env with sensible defaults.
export const settings = {
  vatRate: parseFloat(process.env.VAT_RATE ?? '0.13'),
  currency: process.env.CURRENCY ?? 'USD',
  restaurantName: process.env.RESTAURANT_NAME ?? 'CakeZake',
};

export interface OrderTotals {
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  taxCents: number;
  totalCents: number;
}

export interface TotalsOptions {
  discountCents?: number;
  vatRate?: number;
  serviceChargeRate?: number;
  // Menu prices already include VAT → tax is extracted, not added on top.
  pricesIncludeVat?: boolean;
}

// Single source of truth for money math. All values in integer cents.
// Order: (line gross − item discount) → subtotal − order discount →
//        + service charge → + VAT.
export function computeTotals(
  lines: { unitPriceCents: number; quantity: number; modifiers?: any; discountCents?: number }[],
  opts: TotalsOptions = {},
): OrderTotals {
  const discountCents = opts.discountCents ?? 0;
  const vatRate = opts.vatRate ?? settings.vatRate;
  const serviceChargeRate = opts.serviceChargeRate ?? 0;

  let subtotalCents = 0;
  let itemCount = 0;
  for (const line of lines) {
    const mods = Array.isArray(line.modifiers) ? line.modifiers : [];
    const modCents = mods.reduce(
      (sum: number, m: any) => sum + (m?.priceCents ?? 0),
      0,
    );
    const lineGross = (line.unitPriceCents + modCents) * line.quantity;
    subtotalCents += Math.max(0, lineGross - (line.discountCents ?? 0));
    itemCount += line.quantity;
  }
  const taxable = Math.max(0, subtotalCents - discountCents);
  const serviceChargeCents = Math.round(taxable * serviceChargeRate);
  let taxCents: number;
  let totalCents: number;
  if (opts.pricesIncludeVat) {
    // Prices carry VAT: the customer pays the menu price; VAT is the embedded
    // portion → tax = gross × r / (1 + r).
    totalCents = taxable + serviceChargeCents;
    taxCents = Math.round((totalCents * vatRate) / (1 + vatRate));
  } else {
    taxCents = Math.round((taxable + serviceChargeCents) * vatRate);
    totalCents = taxable + serviceChargeCents + taxCents;
  }
  return {
    itemCount,
    subtotalCents,
    discountCents,
    serviceChargeCents,
    taxCents,
    totalCents,
  };
}
