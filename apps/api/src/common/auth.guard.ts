import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenPayload, verifyToken } from './token';
import { tenantContext } from './tenant-context';
import { IS_PUBLIC_KEY } from './public.decorator';
import { REQUIRE_FEATURE_KEY, FeatureKey } from './feature.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { PermissionKey } from './permissions';

// Maps each gateable FeatureKey to its CafeSetting column — same set the
// `/settings` response builds from (settings.service.ts).
const FEATURE_COLUMN: Record<FeatureKey, string> = {
  reservations: 'featReservations',
  inventory: 'featInventory',
  purchasing: 'featPurchasing',
  roastery: 'featRoastery',
  crm: 'featCrm',
  finance: 'featFinance',
  kds: 'featKds',
  marketing: 'featMarketing',
  hrm: 'featHrm',
};

// Verifies the bearer token AND that it was minted for the tenant (or lack
// of one — the platform console) currently being served. Without this check,
// a token is only bound by its signature, not by which restaurant issued it:
// a tenant's own ADMIN could replay their token with a different X-Tenant
// header (or none at all) and reach another tenant's data, or the platform
// console itself. Every guard in this file goes through here.
function authenticateStrict(req: any): TokenPayload {
  const header: string | undefined = req.headers['authorization'];
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) throw new UnauthorizedException('Staff sign-in required');
  const currentTenantId = tenantContext.getStore()?.tenant?.id ?? null;
  if ((payload.tenantId ?? null) !== currentTenantId) {
    throw new ForbiddenException('This sign-in is not valid for this restaurant');
  }
  req.employee = payload;
  return payload;
}

// Same check, but never throws — used where a route must work for both
// signed-in staff and anonymous guests (self-order/guest payment flows).
// A token that fails tenant-binding is treated as "no token", not an error.
function authenticateSoft(req: any): TokenPayload | null {
  const header: string | undefined = req.headers['authorization'];
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return null;
  const currentTenantId = tenantContext.getStore()?.tenant?.id ?? null;
  if ((payload.tenantId ?? null) !== currentTenantId) return null;
  req.employee = payload;
  return payload;
}

// Requires a valid staff token; optionally a specific permission key granted
// by the signed-in employee's Role. Replaces the old AuthGuard(flag) and
// RoleGuard([...]) — both collapsed into one mechanism since role-name lists
// and boolean flags were really the same "does this employee have X" check.
// Usage: @UseGuards(new PermissionGuard(PERMISSIONS.ORDERS_VOID))
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly permission?: PermissionKey) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const payload = authenticateStrict(req);
    if (this.permission && !payload.permissions?.includes(this.permission))
      throw new ForbiddenException(`Requires "${this.permission}" permission`);
    return true;
  }
}

// Attaches the employee if a valid token is present, but never blocks. Lets a
// handler/service apply permission logic conditionally (e.g. only when an order
// actually has items to void).
@Injectable()
export class SoftAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    authenticateSoft(req);
    return true;
  }
}

// Default guard applied globally (see app.module.ts APP_GUARD) so every
// route is authenticated unless explicitly opted out with @Public(). This
// replaces the previous "opt in per controller" model, which silently left
// dozens of endpoints (customer records, employee management, reports,
// finance, inventory, ...) reachable by anyone who could reach the API at
// all with zero token — the single biggest data-leak risk in this app.
@Injectable()
export class DefaultAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    authenticateStrict(req);

    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(REQUIRE_FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (feature) {
      const column = FEATURE_COLUMN[feature];
      // 'singleton' matches CafeSetting's fixed id (see settings.service.ts).
      const setting = await (this.prisma as any).cafeSetting.findUnique({
        where: { id: 'singleton' },
        select: { [column]: true },
      });
      if (setting && setting[column] === false) {
        throw new ForbiddenException('This module is disabled — enable it in Settings');
      }
    }
    return true;
  }
}

// Param decorator to read the authenticated employee off the request.
import { createParamDecorator } from '@nestjs/common';
export const CurrentEmployee = createParamDecorator(
  (_data, ctx: ExecutionContext): TokenPayload | undefined =>
    ctx.switchToHttp().getRequest().employee,
);

// Reads the `X-Outlet` header (multi-outlet, Phase 3) — mirrors the X-Tenant
// header pattern used for tenant resolution, but this is a per-request,
// per-employee concern, not infra-level, so it's a plain param decorator
// rather than a new AsyncLocalStorage context. Validated against the signed-in
// employee's `outletIds` (null = unrestricted, every pre-Phase-3 employee).
// Returns undefined if no header was sent — callers decide their own fallback
// (e.g. resolve from the order's table, or the tenant's default outlet).
export const CurrentOutlet = createParamDecorator(
  (_data, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest();
    const outletId = req.headers['x-outlet'] as string | undefined;
    if (!outletId) return undefined;
    const allowed: string[] | null = req.employee?.outletIds ?? null;
    if (allowed && !allowed.includes(outletId)) {
      throw new ForbiddenException('You are not assigned to this outlet');
    }
    return outletId;
  },
);

// Reads the `X-Terminal` header (multi-terminal, Phase 3) — the till a
// device was set up as, set once by the outlet/terminal picker. No
// employee-assignment check here (unlike CurrentOutlet) since terminals
// aren't restricted per employee, only outlets are.
export const CurrentTerminal = createParamDecorator(
  (_data, ctx: ExecutionContext): string | undefined =>
    ctx.switchToHttp().getRequest().headers['x-terminal'] as string | undefined,
);
