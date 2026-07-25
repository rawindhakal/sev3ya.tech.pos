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
  packagingChargeCents: number;
  deliveryChargeCents: number;
  taxCents: number;
  totalCents: number;
}

export interface TotalsOptions {
  discountCents?: number;
  vatRate?: number;
  serviceChargeRate?: number;
  // Flat charges (not rates) — packaging typically for TAKEAWAY/DELIVERY,
  // delivery only for DELIVERY. Caller decides which apply by order type.
  packagingChargeCents?: number;
  deliveryChargeCents?: number;
  // Menu prices already include VAT → tax is extracted, not added on top.
  pricesIncludeVat?: boolean;
}

// Single source of truth for money math. All values in integer cents.
// Order: (line gross − item discount) → subtotal − order discount →
//        + service charge → + packaging/delivery → + VAT.
export function computeTotals(
  lines: { unitPriceCents: number; quantity: number; modifiers?: any; discountCents?: number }[],
  opts: TotalsOptions = {},
): OrderTotals {
  const discountCents = opts.discountCents ?? 0;
  const vatRate = opts.vatRate ?? settings.vatRate;
  const serviceChargeRate = opts.serviceChargeRate ?? 0;
  const packagingChargeCents = opts.packagingChargeCents ?? 0;
  const deliveryChargeCents = opts.deliveryChargeCents ?? 0;

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
  const chargeableBase = taxable + serviceChargeCents + packagingChargeCents + deliveryChargeCents;
  let taxCents: number;
  let totalCents: number;
  if (opts.pricesIncludeVat) {
    // Prices carry VAT: the customer pays the menu price; VAT is the embedded
    // portion → tax = gross × r / (1 + r).
    totalCents = chargeableBase;
    taxCents = Math.round((totalCents * vatRate) / (1 + vatRate));
  } else {
    taxCents = Math.round(chargeableBase * vatRate);
    totalCents = chargeableBase + taxCents;
  }
  return {
    itemCount,
    subtotalCents,
    discountCents,
    serviceChargeCents,
    packagingChargeCents,
    deliveryChargeCents,
    taxCents,
    totalCents,
  };
}
