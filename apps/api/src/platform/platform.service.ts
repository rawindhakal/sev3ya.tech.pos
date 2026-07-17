import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { clientForDb, dropClient } from '../common/tenant-context';
import { hashPassword } from '../common/password';
import { invalidateTenantCache } from './tenant.middleware';

const execFileP = promisify(execFile);

// SaaS control plane: plans, tenant provisioning (each tenant gets its OWN
// PostgreSQL database migrated from the shared schema), manual subscription
// payments (cash / direct bank transfer) and platform KPIs.

const DEFAULT_PLANS = [
  { code: 'STARTER', name: 'Starter', priceMonthlyCents: 150000 * 100 / 100, priceYearlyCents: 1500000, maxEmployees: 5, maxItems: 100,
    features: ['POS + KDS + Waiter app', 'Reports & Z-report', '5 staff accounts', 'Email support'] },
  { code: 'PRO', name: 'Pro', priceMonthlyCents: 300000, priceYearlyCents: 3000000, maxEmployees: 15, maxItems: 500,
    features: ['Everything in Starter', 'Inventory & purchasing', 'Accounting + IRD reports', 'Fingerprint attendance & payroll', '15 staff accounts'] },
  { code: 'ENTERPRISE', name: 'Enterprise', priceMonthlyCents: 600000, priceYearlyCents: 6000000, maxEmployees: 100, maxItems: 5000,
    features: ['Everything in Pro', 'Unlimited-scale staff & menu', 'Priority support & onboarding', 'Custom reports'] },
];

@Injectable()
export class PlatformService {
  private readonly log = new Logger('Platform');
  constructor(private readonly prisma: PrismaService) {}

  private get control() {
    return this.prisma.controlClient;
  }

  async ensurePlans() {
    for (const p of DEFAULT_PLANS) {
      await this.control.plan.upsert({
        where: { code: p.code },
        create: { ...p, features: p.features as any },
        update: {},
      });
    }
  }

  async plans() {
    await this.ensurePlans();
    return this.control.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthlyCents: 'asc' } });
  }

  // ── Tenant provisioning: createdb → migrate → seed admin ──
  async createTenant(dto: {
    name: string; slug: string; planCode?: string;
    ownerName?: string; ownerPhone?: string; ownerEmail?: string;
    adminUsername: string; adminPassword: string; trialDays?: number;
  }) {
    const slug = dto.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug || slug.length < 2) throw new BadRequestException('Slug must be at least 2 characters (a-z, 0-9, -)');
    if (!dto.adminUsername?.trim() || !dto.adminPassword) throw new BadRequestException('Admin username and password are required');
    const existing = await this.control.tenant.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException(`Slug "${slug}" is already taken`);
    const dbName = `pos_t_${slug.replace(/-/g, '_')}`;

    // 1) Create the tenant's own database.
    await this.control.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    this.log.log(`Created database ${dbName}`);

    // 2) Apply the full schema via prisma migrate deploy against the new DB.
    const url = (process.env.DATABASE_URL ?? '').replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
    try {
      await execFileP('node_modules/.bin/prisma', ['migrate', 'deploy'], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url },
        timeout: 120_000,
      });
    } catch (err) {
      await this.control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {});
      throw new BadRequestException(`Migration failed: ${(err as Error).message.slice(0, 200)}`);
    }

    // 3) Seed the tenant admin + settings inside the new database.
    const tclient = clientForDb(dbName);
    await tclient.employee.create({
      data: {
        name: dto.ownerName?.trim() || 'Admin',
        role: 'ADMIN',
        username: dto.adminUsername.trim(),
        passwordHash: hashPassword(dto.adminPassword),
        canVoid: true, canDiscount: true, canManageInventory: true, canViewReports: true, canManageStaff: true,
      },
    });
    await tclient.cafeSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', restaurantName: dto.name.trim() },
      update: { restaurantName: dto.name.trim() },
    });

    // 4) Register the tenant in the control plane.
    const plan = dto.planCode ? await this.control.plan.findUnique({ where: { code: dto.planCode } }) : null;
    const trialDays = dto.trialDays ?? 14;
    const tenant = await this.control.tenant.create({
      data: {
        slug, name: dto.name.trim(), dbName,
        planId: plan?.id,
        ownerName: dto.ownerName, ownerPhone: dto.ownerPhone, ownerEmail: dto.ownerEmail,
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() + trialDays * 864e5),
      },
      include: { plan: true },
    });
    invalidateTenantCache(slug);
    return { ...tenant, loginHint: `Sign in at ${slug}.s3vya.tech (or with restaurant code "${slug}") as ${dto.adminUsername}` };
  }

  tenants() {
    return this.control.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { plan: true, payments: { orderBy: { createdAt: 'desc' }, take: 3 } },
    });
  }

  async setStatus(id: string, status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED') {
    const t = await this.control.tenant.update({ where: { id }, data: { status } });
    invalidateTenantCache(t.slug);
    return t;
  }

  // ── Manual payment gateway: cash / direct bank transfer ──
  async recordPayment(dto: {
    tenantId: string; planCode?: string; amountCents: number;
    method: 'CASH' | 'BANK_TRANSFER'; reference?: string; months?: number;
    receivedBy?: string; note?: string;
  }) {
    const tenant = await this.control.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!dto.amountCents || dto.amountCents <= 0) throw new BadRequestException('Amount must be positive');
    if (dto.method === 'BANK_TRANSFER' && !dto.reference?.trim())
      throw new BadRequestException('Bank transfers need the transaction reference number');
    const months = Math.max(1, dto.months ?? 1);
    const base = tenant.paidUntil && tenant.paidUntil > new Date() ? tenant.paidUntil : new Date();
    const periodEnd = new Date(base);
    periodEnd.setMonth(periodEnd.getMonth() + months);
    const plan = dto.planCode ? await this.control.plan.findUnique({ where: { code: dto.planCode } }) : null;

    const payment = await this.control.subscriptionPayment.create({
      data: {
        tenantId: tenant.id, planId: plan?.id ?? tenant.planId,
        amountCents: dto.amountCents, method: dto.method, reference: dto.reference,
        months, status: 'VERIFIED', periodStart: base, periodEnd,
        receivedBy: dto.receivedBy, note: dto.note,
      },
    });
    const updated = await this.control.tenant.update({
      where: { id: tenant.id },
      data: { paidUntil: periodEnd, status: 'ACTIVE', ...(plan ? { planId: plan.id } : {}) },
    });
    invalidateTenantCache(tenant.slug);
    return { payment, tenant: updated };
  }

  async stats() {
    const [tenants, payments] = await Promise.all([
      this.control.tenant.findMany({ include: { plan: true } }),
      this.control.subscriptionPayment.findMany({ where: { status: 'VERIFIED' } }),
    ]);
    const now = new Date();
    const active = tenants.filter((t) => t.status === 'ACTIVE' && (!t.paidUntil || t.paidUntil > now));
    const trial = tenants.filter((t) => t.status === 'TRIAL' && (!t.trialEndsAt || t.trialEndsAt > now));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      tenants: tenants.length,
      active: active.length,
      trial: trial.length,
      suspended: tenants.filter((t) => t.status === 'SUSPENDED').length,
      mrrCents: active.reduce((s, t) => s + (t.plan?.priceMonthlyCents ?? 0), 0),
      collectedThisMonthCents: payments.filter((p) => p.createdAt >= monthStart).reduce((s, p) => s + p.amountCents, 0),
      collectedTotalCents: payments.reduce((s, p) => s + p.amountCents, 0),
    };
  }

  async removeTenant(id: string, dropDb: boolean) {
    const t = await this.control.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tenant not found');
    await this.control.tenant.delete({ where: { id } });
    invalidateTenantCache(t.slug);
    if (dropDb) {
      dropClient(t.dbName);
      await this.control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${t.dbName}" WITH (FORCE)`).catch(() => {});
    }
    return { ok: true, droppedDb: dropDb };
  }
}
