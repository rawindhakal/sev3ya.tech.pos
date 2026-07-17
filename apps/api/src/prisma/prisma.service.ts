import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from '../common/tenant-context';

// Type-level: expose the full PrismaClient surface (supplied by the Proxy).
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PrismaService extends PrismaClient {}

// Tenant-aware Prisma facade (SaaS). Every injection point keeps working
// unchanged: property access is delegated to the CURRENT tenant's client
// (set by TenantMiddleware via AsyncLocalStorage) or, outside a tenant
// request, to the platform/control database client.
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly controlClient: PrismaClient;

  constructor() {
    this.controlClient = new PrismaClient();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'controlClient' || prop === 'onModuleInit' || prop === 'onModuleDestroy' || prop === 'constructor') {
          return Reflect.get(target, prop, receiver);
        }
        const client = tenantContext.getStore()?.client ?? self.controlClient;
        const value = (client as any)[prop];
        return typeof value === 'function' ? value.bind(client) : value;
      },
    });
  }

  async onModuleInit() {
    await this.controlClient.$connect();
  }

  async onModuleDestroy() {
    await this.controlClient.$disconnect();
  }
}
