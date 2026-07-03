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
      create: { id: SINGLETON, restaurantName: envSettings.restaurantName },
      update: {},
    });
  }

  // Money config still comes from env (stable); branding comes from the DB.
  async get() {
    const branding = await this.ensure();
    return {
      vatRate: envSettings.vatRate,
      currency: envSettings.currency,
      restaurantName: branding.restaurantName,
      address: branding.address,
      phone: branding.phone,
      taxId: branding.taxId,
      receiptHeader: branding.receiptHeader,
      receiptFooter: branding.receiptFooter,
      wifiPassword: branding.wifiPassword,
    };
  }

  async update(data: {
    restaurantName?: string;
    address?: string;
    phone?: string;
    taxId?: string;
    receiptHeader?: string;
    receiptFooter?: string;
    wifiPassword?: string;
  }) {
    await this.ensure();
    await this.prisma.cafeSetting.update({ where: { id: SINGLETON }, data });
    return this.get();
  }
}
