// Central business settings, read from env with sensible defaults.
export const settings = {
  vatRate: parseFloat(process.env.VAT_RATE ?? '0.13'),
  currency: process.env.CURRENCY ?? 'USD',
  restaurantName: process.env.RESTAURANT_NAME ?? 'CakeZake',
};

export interface OrderTotals {
  itemCount: number;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

// Single source of truth for money math. All values in integer cents.
export function computeTotals(
  lines: { unitPriceCents: number; quantity: number; modifiers?: any }[],
  discountCents = 0,
): OrderTotals {
  let subtotalCents = 0;
  let itemCount = 0;
  for (const line of lines) {
    const mods = Array.isArray(line.modifiers) ? line.modifiers : [];
    const modCents = mods.reduce(
      (sum: number, m: any) => sum + (m?.priceCents ?? 0),
      0,
    );
    subtotalCents += (line.unitPriceCents + modCents) * line.quantity;
    itemCount += line.quantity;
  }
  const taxable = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxable * settings.vatRate);
  const totalCents = taxable + taxCents;
  return { itemCount, subtotalCents, taxCents, discountCents, totalCents };
}
