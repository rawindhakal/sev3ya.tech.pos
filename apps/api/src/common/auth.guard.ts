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

// Requires a valid staff token; optionally a specific permission flag.
// Usage: @UseGuards(new AuthGuard('canVoid'))
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly permission?: keyof TokenPayload) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const payload = authenticateStrict(req);
    if (this.permission && !payload[this.permission])
      throw new ForbiddenException(`Requires "${String(this.permission)}" permission`);
    return true;
  }
}

// Requires a valid staff token with one of the given roles.
// Usage: @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly roles: string[]) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const payload = authenticateStrict(req);
    if (!this.roles.includes(payload.role))
      throw new ForbiddenException(`Requires ${this.roles.join(' or ')} role`);
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
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    authenticateStrict(req);
    return true;
  }
}

// Param decorator to read the authenticated employee off the request.
import { createParamDecorator } from '@nestjs/common';
export const CurrentEmployee = createParamDecorator(
  (_data, ctx: ExecutionContext): TokenPayload | undefined =>
    ctx.switchToHttp().getRequest().employee,
);
