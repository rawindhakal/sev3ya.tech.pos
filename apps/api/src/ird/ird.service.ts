import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatBs, formatBsIrd, fiscalYearBs } from '../common/bs-date';

// IRD Nepal (CBMS) e-billing: a sales register in the IRD-required shape
// (invoice no, BS date, buyer PAN/name, taxable value, VAT, total) plus
// direct sync of each invoice to the IRD CBMS bill API. Credentials and the
// endpoint are configured under Settings; every attempt is recorded on the
// order (irdSyncedAt / irdSyncStatus / irdSyncMessage).
@Injectable()
export class IrdService {
  constructor(private readonly prisma: PrismaService) {}

  private settings() {
    return this.prisma.cafeSetting.findUnique({ where: { id: 'singleton' } });
  }

  // ── IRD-ready sales register ─────────────────────────
  async report(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
    const end = to ? new Date(`${to}T23:59:59`) : new Date();
    const s = await this.settings();
    const orders = await this.prisma.order.findMany({
      where: { status: 'PAID', paidAt: { gte: start, lte: end } },
      orderBy: { paidAt: 'asc' },
      select: {
        id: true, number: true, paidAt: true, customerName: true,
        subtotalCents: true, discountCents: true, serviceChargeCents: true,
        taxCents: true, totalCents: true,
        irdSyncedAt: true, irdSyncStatus: true, irdSyncMessage: true,
      },
    });
    const rows = orders.map((o, i) => ({
      sn: i + 1,
      invoiceNumber: o.number,
      dateAd: o.paidAt,
      dateBs: o.paidAt ? formatBs(o.paidAt) : null,
      fiscalYear: o.paidAt ? fiscalYearBs(o.paidAt) : null,
      buyerName: o.customerName ?? 'Cash Sale',
      buyerPan: '',
      taxableCents: o.totalCents - o.taxCents,
      vatCents: o.taxCents,
      totalCents: o.totalCents,
      syncStatus: o.irdSyncStatus ?? 'PENDING',
      syncedAt: o.irdSyncedAt,
      syncMessage: o.irdSyncMessage,
    }));
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
    return {
      sellerPan: s?.irdSellerPan ?? null,
      sellerName: s?.restaurantName ?? null,
      irdEnabled: s?.irdEnabled ?? false,
      range: { from: start, to: end },
      totals: {
        invoices: rows.length,
        taxableCents: sum((r) => r.taxableCents),
        vatCents: sum((r) => r.vatCents),
        totalCents: sum((r) => r.totalCents),
        synced: rows.filter((r) => r.syncStatus === 'SYNCED').length,
        pending: rows.filter((r) => r.syncStatus === 'PENDING').length,
        failed: rows.filter((r) => r.syncStatus === 'FAILED').length,
      },
      rows,
    };
  }

  // ── Direct sync to the IRD CBMS bill API ────────────
  async sync(limit = 50) {
    const s = await this.settings();
    if (!s?.irdEnabled) throw new BadRequestException('IRD sync is disabled — enable it in Settings');
    if (!s.irdUsername || !s.irdPassword || !s.irdSellerPan)
      throw new BadRequestException('IRD credentials missing — set username, password and seller PAN in Settings');
    const url = s.irdApiUrl?.trim() || 'https://cbapi.ird.gov.np/api/bill';

    const unsynced = await this.prisma.order.findMany({
      where: { status: 'PAID', OR: [{ irdSyncStatus: null }, { irdSyncStatus: 'FAILED' }] },
      orderBy: { paidAt: 'asc' },
      take: limit,
    });

    let synced = 0, failed = 0;
    for (const o of unsynced) {
      const paidAt = o.paidAt ?? new Date();
      // CBMS bill payload (amounts in rupees, dates in BS).
      const payload = {
        username: s.irdUsername,
        password: s.irdPassword,
        seller_pan: s.irdSellerPan,
        buyer_pan: '',
        buyer_name: o.customerName ?? '',
        fiscal_year: fiscalYearBs(paidAt),
        invoice_number: String(o.number),
        invoice_date: formatBsIrd(paidAt),
        total_sales: o.totalCents / 100,
        taxable_sales_vat: (o.totalCents - o.taxCents) / 100,
        vat: o.taxCents / 100,
        excise_duty: 0,
        taxable_sales_hst: 0,
        hst: 0,
        amount_for_esf: 0,
        esf: 0,
        export_sales: 0,
        tax_exempted_sales: 0,
        isrealtime: true,
        datetimeclient: new Date().toISOString(),
      };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });
        const body = await res.text();
        // CBMS returns "200" (success) / "101" (auth) / "100" (invalid) codes.
        const ok = res.ok && /200/.test(body);
        await this.prisma.order.update({
          where: { id: o.id },
          data: {
            irdSyncedAt: ok ? new Date() : null,
            irdSyncStatus: ok ? 'SYNCED' : 'FAILED',
            irdSyncMessage: `HTTP ${res.status}: ${body.slice(0, 180)}`,
          },
        });
        ok ? synced++ : failed++;
      } catch (err) {
        await this.prisma.order.update({
          where: { id: o.id },
          data: { irdSyncStatus: 'FAILED', irdSyncMessage: String((err as Error).message).slice(0, 180) },
        });
        failed++;
      }
    }
    return { attempted: unsynced.length, synced, failed };
  }

  // ── Tally-ready export ───────────────────────────────
  // One Sales voucher per paid invoice, importable via Tally's
  // Import Data → Vouchers. Debits the tender ledger(s), credits Sales and
  // VAT Output. Amounts in rupees; narration carries the BS date.
  async tallyXml(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
    const end = to ? new Date(`${to}T23:59:59`) : new Date();
    const orders = await this.prisma.order.findMany({
      where: { status: 'PAID', paidAt: { gte: start, lte: end } },
      orderBy: { paidAt: 'asc' },
      include: { payments: true },
    });
    const esc = (v: unknown) =>
      String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rs = (cents: number) => (cents / 100).toFixed(2);
    const LEDGER: Record<string, string> = {
      CASH: 'Cash', CARD: 'Card Sales', BANK: 'Bank', FONEPAY: 'Fonepay',
      ESEWA: 'eSewa', KHALTI: 'Khalti', CREDIT: 'Sundry Debtors', OFFLINE: 'Cash',
    };

    const vouchers = orders.map((o) => {
      const paidAt = o.paidAt ?? new Date();
      const yyyymmdd = paidAt.toISOString().slice(0, 10).replace(/-/g, '');
      const netSales = o.totalCents - o.taxCents;
      const debits = (o.payments.length ? o.payments : [{ method: 'CASH', amountCents: o.totalCents } as any])
        .map(
          (p) => `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${esc(LEDGER[p.method] ?? p.method)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rs(p.amountCents)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`,
        )
        .join('');
      return `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create">
      <DATE>${yyyymmdd}</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${o.number}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${esc(LEDGER[o.payments[0]?.method ?? 'CASH'] ?? 'Cash')}</PARTYLEDGERNAME>
      <NARRATION>POS invoice #${o.number}${o.customerName ? ` — ${esc(o.customerName)}` : ''} (BS ${formatBs(paidAt)})</NARRATION>${debits}
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Sales Account</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${rs(netSales)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>VAT Output</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${rs(o.taxCents)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>
   <REQUESTDATA>${vouchers.join('')}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  }
}
