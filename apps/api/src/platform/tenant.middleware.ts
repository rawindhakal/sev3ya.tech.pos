import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { clientForDb, tenantContext } from '../common/tenant-context';

// Resolves the tenant for each request — from the `x-tenant` header or the
// subdomain (e.g. everest.s3vya.tech → "everest") — and runs the handler
// inside that tenant's database context. No tenant = platform/control DB.
// Suspended/expired tenants get a clear 402 before touching any data.
const RESERVED = new Set(['www', 's3vya', 'localhost', 'api', 'app']);
const cache = new Map<string, { t: any; at: number }>();

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let slug = (req.headers['x-tenant'] as string | undefined)?.trim().toLowerCase();
    if (!slug) {
      const host = (req.headers.host ?? '').split(':')[0];
      const first = host.split('.')[0];
      if (host.split('.').length >= 3 && !RESERVED.has(first)) slug = first;
    }
    if (!slug) return next(); // platform / control context

    // 60s tenant lookup cache.
    const hit = cache.get(slug);
    let tenant = hit && Date.now() - hit.at < 60_000 ? hit.t : undefined;
    if (tenant === undefined) {
      tenant = await this.prisma.controlClient.tenant.findUnique({ where: { slug } });
      cache.set(slug, { t: tenant ?? null, at: Date.now() });
    }
    if (!tenant) return res.status(404).json({ message: `Unknown restaurant "${slug}"` });

    // Subscription enforcement.
    const now = new Date();
    const inTrial = tenant.status === 'TRIAL' && (!tenant.trialEndsAt || tenant.trialEndsAt > now);
    const paid = tenant.status === 'ACTIVE' && (!tenant.paidUntil || tenant.paidUntil > now);
    if (tenant.status === 'SUSPENDED' || (!inTrial && !paid)) {
      return res.status(402).json({
        message: 'Subscription inactive — please contact s3vya to renew (cash or bank transfer accepted).',
        tenant: tenant.slug,
        status: tenant.status,
      });
    }

    const client = clientForDb(tenant.dbName);
    tenantContext.run(
      { client, tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status } },
      () => next(),
    );
  }
}

export function invalidateTenantCache(slug?: string) {
  if (slug) cache.delete(slug);
  else cache.clear();
}
