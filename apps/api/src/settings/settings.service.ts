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

  // Danger zone: wipe all sales / operational data while KEEPING configuration
  // (menu, staff, tables, suppliers, settings). For starting real trading with a
  // clean slate. Deletes children before parents to satisfy FK constraints.
  async resetData(actor?: { sub?: string; name?: string }) {
    const cleared: Record<string, number> = {};
    await this.prisma.$transaction(
      async (tx) => {
        cleared.payments = (await tx.payment.deleteMany()).count;
        cleared.orderItems = (await tx.orderItem.deleteMany()).count;
        cleared.cashMovements = (await tx.cashMovement.deleteMany()).count;
        cleared.orders = (await tx.order.deleteMany()).count;
        cleared.cashDrawerSessions = (await tx.cashDrawerSession.deleteMany()).count;
        cleared.reservations = (await tx.reservation.deleteMany()).count;
        cleared.shifts = (await tx.shift.deleteMany()).count;
        cleared.stockMovements = (await tx.stockMovement.deleteMany()).count;
        cleared.purchaseOrderLines = (await tx.purchaseOrderLine.deleteMany()).count;
        cleared.purchaseOrders = (await tx.purchaseOrder.deleteMany()).count;
        cleared.cuppingScores = (await tx.cuppingScore.deleteMany()).count;
        cleared.roastBatches = (await tx.roastBatch.deleteMany()).count;
        cleared.greenBeanBatches = (await tx.greenBeanBatch.deleteMany()).count;
        cleared.expenses = (await tx.expense.deleteMany()).count;
        cleared.auditLogs = (await tx.auditLog.deleteMany()).count;
        cleared.idempotencyKeys = (await tx.idempotencyKey.deleteMany()).count;
        // Free every table so the floor starts clean.
        await tx.restaurantTable.updateMany({ data: { status: 'AVAILABLE' } });
      },
      { timeout: 30000 },
    );
    // Record the reset itself (audit was just cleared, so this is the first entry).
    await this.prisma.auditLog.create({
      data: {
        employeeId: actor?.sub,
        employeeName: actor?.name ?? 'system',
        action: 'RESET_DATA',
        detail: `Cleared sales data: ${JSON.stringify(cleared)}`,
      },
    });
    return { ok: true, cleared };
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
