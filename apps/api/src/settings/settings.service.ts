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
      targetTicketMinutes: s.targetTicketMinutes,
      restaurantName: s.restaurantName,
      address: s.address,
      phone: s.phone,
      taxId: s.taxId,
      receiptHeader: s.receiptHeader,
      receiptFooter: s.receiptFooter,
      wifiPassword: s.wifiPassword,
      billTemplate: s.billTemplate ?? null,
      kotTemplate: s.kotTemplate ?? null,
      packagingChargeCents: s.packagingChargeCents,
      deliveryChargeCents: s.deliveryChargeCents,
      // IRD config — the password is write-only (never returned to clients).
      ird: {
        enabled: s.irdEnabled,
        username: s.irdUsername,
        sellerPan: s.irdSellerPan,
        apiUrl: s.irdApiUrl,
        hasPassword: !!s.irdPassword,
      },
      // Payment-gateway merchant config — secret keys are write-only
      // (never returned), same masking pattern as the IRD password above.
      // `configured` tells the POS whether it can offer a real gateway QR
      // for that provider or should fall back to manual "record as X".
      paymentGateways: {
        esewa: { merchantCode: s.esewaMerchantCode, configured: !!(s.esewaMerchantCode && s.esewaSecretKey) },
        khalti: { publicKey: s.khaltiPublicKey, configured: !!(s.khaltiPublicKey && s.khaltiSecretKey) },
        fonepay: { merchantCode: s.fonepayMerchantCode, configured: !!(s.fonepayMerchantCode && s.fonepaySecretKey) },
      },
      sms: { senderId: s.smsGatewaySenderId, configured: !!s.smsGatewayApiKey },
      features: {
        reservations: s.featReservations,
        inventory: s.featInventory,
        purchasing: s.featPurchasing,
        roastery: s.featRoastery,
        modifiers: s.featModifiers,
        crm: s.featCrm,
        finance: s.featFinance,
        kds: s.featKds,
        selfOrder: s.featSelfOrder,
        marketing: s.featMarketing,
        hrm: s.featHrm,
      },
    };
  }

  // Rates used by the order money math (single source of truth).
  async getRates() {
    const s = await this.ensure();
    return {
      vatRate: s.vatRate,
      serviceChargeRate: s.serviceChargeRate,
      pricesIncludeVat: s.pricesIncludeVat,
      packagingChargeCents: s.packagingChargeCents,
      deliveryChargeCents: s.deliveryChargeCents,
    };
  }

  // Gateway credentials for the payments-gateway/notifications modules —
  // never sent to the browser, only read server-side.
  async getGatewayConfig() {
    const s = await this.ensure();
    return {
      esewa: { merchantCode: s.esewaMerchantCode, secretKey: s.esewaSecretKey },
      khalti: { publicKey: s.khaltiPublicKey, secretKey: s.khaltiSecretKey },
      fonepay: { merchantCode: s.fonepayMerchantCode, secretKey: s.fonepaySecretKey },
      sms: { apiKey: s.smsGatewayApiKey, senderId: s.smsGatewaySenderId },
    };
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
          // GiftCardTransaction.orderId has no cascade/set-null in the schema
          // (gift cards aren't part of this category by design — a sales
          // reset shouldn't erase real stored-value balances or their
          // ledger). Detach the reference instead of leaving it pointing at
          // an order we're about to delete — otherwise order.deleteMany()
          // below throws a foreign key violation and the whole reset
          // rolls back, which is exactly the "reset doesn't work" bug: any
          // tenant that's ever taken a gift-card payment couldn't reset at
          // all, even with every category on its default selection.
          await tx.giftCardTransaction.updateMany({ where: { orderId: { not: null } }, data: { orderId: null } });
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
          // ComboComponent.componentMenuItemId has no cascade — a menu item
          // used as a combo's component (even if the combo itself is also
          // being deleted below) blocks menuItem.deleteMany() otherwise.
          cleared.comboComponents = (await tx.comboComponent.deleteMany()).count;
          cleared.recipeItems = (await tx.recipeItem.deleteMany()).count;
          cleared.menuItemVariants = (await tx.menuItemVariant.deleteMany()).count;
          cleared.modifiers = (await tx.modifier.deleteMany()).count;
          cleared.modifierGroups = (await tx.modifierGroup.deleteMany()).count;
          // OrderItem.menuItemId also has no cascade. If order history is
          // being kept (transactions category not selected — e.g. "rebuild
          // the menu but keep sales history"), detach it rather than block
          // the menu wipe; menuItemId is nullable precisely to support
          // "open items" with no linked menu item, so this is a supported
          // state, not a workaround. If transactions IS selected, orderItems
          // were already deleted above, so there's nothing to detach.
          if (!want.has('transactions')) {
            await tx.orderItem.updateMany({ where: { menuItemId: { not: null } }, data: { menuItemId: null } });
          }
          cleared.menuItems = (await tx.menuItem.deleteMany()).count;
          cleared.categories = (await tx.category.deleteMany()).count;
        }
        if (want.has('customers')) {
          // Order.customerId has no cascade either. Same detach-if-keeping-
          // history logic as menuItemId above.
          if (!want.has('transactions')) {
            await tx.order.updateMany({ where: { customerId: { not: null } }, data: { customerId: null } });
          }
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
    targetTicketMinutes?: number;
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
    featSelfOrder?: boolean;
    featMarketing?: boolean;
    featHrm?: boolean;
    billTemplate?: object;
    kotTemplate?: object;
    irdEnabled?: boolean;
    irdUsername?: string;
    irdPassword?: string;
    irdSellerPan?: string;
    irdApiUrl?: string;
    packagingChargeCents?: number;
    deliveryChargeCents?: number;
    esewaMerchantCode?: string;
    esewaSecretKey?: string;
    khaltiPublicKey?: string;
    khaltiSecretKey?: string;
    fonepayMerchantCode?: string;
    fonepaySecretKey?: string;
    smsGatewayApiKey?: string;
    smsGatewaySenderId?: string;
  }) {
    await this.ensure();
    await this.prisma.cafeSetting.update({ where: { id: SINGLETON }, data });
    return this.get();
  }
}
