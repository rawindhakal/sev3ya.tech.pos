import { createHmac, timingSafeEqual } from 'crypto';

// Lightweight signed token (HMAC-SHA256) — no external dep. Payload carries the
// employee id + permission flags so guards can authorise without a DB hit.
const SECRET = process.env.AUTH_SECRET ?? 'cakezake-dev-secret-change-me';

export interface TokenPayload {
  sub: string;
  name: string;
  role: string;
  canVoid: boolean;
  canDiscount: boolean;
  canManageInventory: boolean;
  canViewReports: boolean;
  canManageStaff: boolean;
  exp: number;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (data: string) => createHmac('sha256', SECRET).update(data).digest('base64url');

export function signToken(payload: Omit<TokenPayload, 'exp'>, ttlSeconds = 43200): string {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = b64(body);
  return `${data}.${sign(data)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenPayload;
    if (body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}
