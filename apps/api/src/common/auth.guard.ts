import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenPayload, verifyToken } from './token';

// Requires a valid staff token; optionally a specific permission flag.
// Usage: @UseGuards(new AuthGuard('canVoid'))
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly permission?: keyof TokenPayload) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload) throw new UnauthorizedException('Staff sign-in required');
    if (this.permission && !payload[this.permission])
      throw new ForbiddenException(`Requires "${String(this.permission)}" permission`);
    req.employee = payload;
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
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    req.employee = token ? verifyToken(token) : null;
    return true;
  }
}

// Param decorator to read the authenticated employee off the request.
import { createParamDecorator } from '@nestjs/common';
export const CurrentEmployee = createParamDecorator(
  (_data, ctx: ExecutionContext): TokenPayload | undefined =>
    ctx.switchToHttp().getRequest().employee,
);
