import { SetMetadata } from '@nestjs/common';

// Marks a route (or an entire controller) as reachable with no staff bearer
// token. Everything else is denied by default by the global auth guard — see
// DefaultAuthGuard in auth.guard.ts. Use sparingly: only for endpoints that
// are genuinely meant to be hit by an unauthenticated guest/device/monitor.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
