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
      restaurantName: s.restaurantName,
      address: s.address,
      phone: s.phone,
      taxId: s.taxId,
      receiptHeader: s.receiptHeader,
      receiptFooter: s.receiptFooter,
      wifiPassword: s.wifiPassword,
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
    return { vatRate: s.vatRate, serviceChargeRate: s.serviceChargeRate };
  }

  async update(data: {
    restaurantName?: string;
    address?: string;
    phone?: string;
    taxId?: string;
    vatRate?: number;
    serviceChargeRate?: number;
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
  }) {
    await this.ensure();
    await this.prisma.cafeSetting.update({ where: { id: SINGLETON }, data });
    return this.get();
  }
}
