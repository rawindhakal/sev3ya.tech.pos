import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { settings as envSettings } from '../common/settings';

const SINGLETON = 'singleton';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Ensure the single settings row exists, seeded from env defaults.
  private ensure() {
    return this.prisma.cafeSetting.upsert({
      where: { id: SINGLETON },
      create: {
        id: SINGLETON,
        restaurantName: envSettings.restaurantName,
        vatRate: envSettings.vatRate,
      },
      update: {},
    });
  }

  // Currency stays env-driven; tax rates + branding are DB-configurable.
  async get() {
    const s = await this.ensure();
    return {
      currency: envSettings.currency,
      vatRate: s.vatRate,
      serviceChargeRate: s.serviceChargeRate,
      pricesIncludeVat: s.pricesIncludeVat,
      currencySymbol: s.currencySymbol,
      defaultGuestCount: s.defaultGuestCount,
      restaurantName: s.restaurantName,
      address: s.address,
      phone: s.phone,
      taxId: s.taxId,
      receiptHeader: s.receiptHeader,
      receiptFooter: s.receiptFooter,
      wifiPassword: s.wifiPassword,
      billTemplate: s.billTemplate ?? null,
      kotTemplate: s.kotTemplate ?? null,
      // IRD config — the password is write-only (never returned to clients).
      attendanceDevice: { ip: s.zkDeviceIp, port: s.zkDevicePort },
      ird: {
        enabled: s.irdEnabled,
        username: s.irdUsername,
        sellerPan: s.irdSellerPan,
        apiUrl: s.irdApiUrl,
        hasPassword: !!s.irdPassword,
      },
      features: {
        reservations: s.featReservations,
        inventory: s.featInventory,
        purchasing: s.featPurchasing,
        roastery: s.featRoastery,
        modifiers: s.featModifiers,
        crm: s.featCrm,
        finance: s.featFinance,
        kds: s.featKds,
      },
    };
  }

  // Rates used by the order money math (single source of truth).
  async getRates() {
    const s = await this.ensure();
    return { vatRate: s.vatRate, serviceChargeRate: s.serviceChargeRate, pricesIncludeVat: s.pricesIncludeVat };
  }

  // Danger zone: wipe SELECTED sales / operational data categories while
  // ALWAYS keeping staff and settings (so the admin who ran this can still
  // sign in). Deletes children before parents to satisfy FK constraints.
  // `categories` — any of: transactions, reservations, purchasing, inventory,
  // menu, customers, expenses, roastery, attendance, auditLog.
  static readonly RESET_CATEGORIES = [
    'transactions', 'reservations', 'purchasing', 'inventory',
    'menu', 'customers', 'expenses', 'roastery', 'attendance', 'auditLog',
  ] as const;

  async resetData(categories: string[], actor?: { sub?: string; name?: string }) {
    const want = new Set(categories.length ? categories : SettingsService.RESET_CATEGORIES);
    const cleared: Record<string, number> = {};
    await this.prisma.$transaction(
      async (tx) => {
        if (want.has('transactions')) {
          cleared.payments = (await tx.payment.deleteMany()).count;
          cleared.orderItems = (await tx.orderItem.deleteMany()).count;
          cleared.cashMovements = (await tx.cashMovement.deleteMany()).count;
          cleared.orders = (await tx.order.deleteMany()).count;
          cleared.cashDrawerSessions = (await tx.cashDrawerSession.deleteMany()).count;
          cleared.idempotencyKeys = (await tx.idempotencyKey.deleteMany()).count;
          cleared.journalLines = (await tx.journalLine.deleteMany()).count;
          cleared.journalEntries = (await tx.journalEntry.deleteMany()).count;
          // Free every table so the floor starts clean.
          await tx.restaurantTable.updateMany({ data: { status: 'AVAILABLE' } });
        }
        if (want.has('reservations')) {
          cleared.reservations = (await tx.reservation.deleteMany()).count;
        }
        if (want.has('purchasing')) {
          cleared.purchaseOrderLines = (await tx.purchaseOrderLine.deleteMany()).count;
          cleared.purchaseOrders = (await tx.purchaseOrder.deleteMany()).count;
        }
        if (want.has('inventory')) {
          cleared.stockMovements = (await tx.stockMovement.deleteMany()).count;
        }
        if (want.has('menu')) {
          cleared.recipeItems = (await tx.recipeItem.deleteMany()).count;
          cleared.menuItemVariants = (await tx.menuItemVariant.deleteMany()).count;
          cleared.modifiers = (await tx.modifier.deleteMany()).count;
          cleared.modifierGroups = (await tx.modifierGroup.deleteMany()).count;
          cleared.menuItems = (await tx.menuItem.deleteMany()).count;
          cleared.categories = (await tx.category.deleteMany()).count;
        }
        if (want.has('customers')) {
          cleared.creditLedgerEntries = (await tx.creditLedgerEntry.deleteMany()).count;
          cleared.customers = (await tx.customer.deleteMany()).count;
        }
        if (want.has('expenses')) {
          cleared.expenses = (await tx.expense.deleteMany()).count;
        }
        if (want.has('roastery')) {
          cleared.cuppingScores = (await tx.cuppingScore.deleteMany()).count;
          cleared.roastBatches = (await tx.roastBatch.deleteMany()).count;
          cleared.greenBeanBatches = (await tx.greenBeanBatch.deleteMany()).count;
        }
        if (want.has('attendance')) {
          cleared.attendanceLogs = (await tx.attendanceLog.deleteMany()).count;
          cleared.shifts = (await tx.shift.deleteMany()).count;
        }
        if (want.has('auditLog')) {
          cleared.auditLogs = (await tx.auditLog.deleteMany()).count;
        }
      },
      { timeout: 30000 },
    );
    // Record the reset itself (may or may not have just cleared the log).
    await this.prisma.auditLog.create({
      data: {
        employeeId: actor?.sub,
        employeeName: actor?.name ?? 'system',
        action: 'RESET_DATA',
        detail: `Cleared [${[...want].join(', ')}]: ${JSON.stringify(cleared)}`,
      },
    });
    return { ok: true, cleared, categories: [...want] };
  }

  // ── Discount presets (Settings → Discounts → POS discount modal) ──
  discountPresets(activeOnly = false) {
    return this.prisma.discountPreset.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }
  createDiscountPreset(data: { name: string; type: 'PCT' | 'RS'; value: number; sortOrder?: number }) {
    return this.prisma.discountPreset.create({ data });
  }
  updateDiscountPreset(id: string, data: { name?: string; type?: 'PCT' | 'RS'; value?: number; isActive?: boolean; sortOrder?: number }) {
    return this.prisma.discountPreset.update({ where: { id }, data });
  }
  deleteDiscountPreset(id: string) {
    return this.prisma.discountPreset.delete({ where: { id } });
  }

  async update(data: {
    restaurantName?: string;
    address?: string;
    phone?: string;
    taxId?: string;
    vatRate?: number;
    serviceChargeRate?: number;
    pricesIncludeVat?: boolean;
    currencySymbol?: string;
    defaultGuestCount?: number;
    receiptHeader?: string;
    receiptFooter?: string;
    wifiPassword?: string;
    featReservations?: boolean;
    featInventory?: boolean;
    featPurchasing?: boolean;
    featRoastery?: boolean;
    featModifiers?: boolean;
    featCrm?: boolean;
    featFinance?: boolean;
    featKds?: boolean;
    billTemplate?: object;
    kotTemplate?: object;
    irdEnabled?: boolean;
    irdUsername?: string;
    irdPassword?: string;
    irdSellerPan?: string;
    irdApiUrl?: string;
    zkDeviceIp?: string;
    zkDevicePort?: number;
  }) {
    await this.ensure();
    await this.prisma.cafeSetting.update({ where: { id: SINGLETON }, data });
    return this.get();
  }
}
