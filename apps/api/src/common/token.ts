import { createHmac, timingSafeEqual } from 'crypto';

// Lightweight signed token (HMAC-SHA256) — no external dep. Payload carries the
// employee id + permission flags so guards can authorise without a DB hit.
//
// AUTH_SECRET MUST be set outside development — falling back to a string
// that's sitting in a public git history would let anyone forge an ADMIN
// token for any tenant (or the platform console). We only allow the fallback
// when NODE_ENV isn't 'production', so local dev keeps working without env
// setup but a real deploy fails loudly instead of shipping a forgeable secret.
function resolveSecret(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set in production — refusing to start with a guessable default.');
  }
  // eslint-disable-next-line no-console
  console.warn('[auth] AUTH_SECRET not set — using an insecure dev-only default. Set AUTH_SECRET before deploying.');
  return 'cakezake-dev-secret-change-me';
}
const SECRET = resolveSecret();

export interface TokenPayload {
  sub: string;
  name: string;
  // Display name of the employee's Role (e.g. "Owner", "Manager", or any
  // custom role name) — free text now that roles are dynamic; never compare
  // this by string equality for authorization, check `permissions` instead.
  role: string;
  roleId: string;
  // BACK_OFFICE | WAITER_ONLY — replaces the old `role === 'WAITER'` check.
  portal: string;
  // Flat list of granted permission keys (see common/permissions.ts). This
  // is resolved from the employee's Role at login time — like the old
  // boolean flags, a permission change only takes effect on next login
  // (token is stateless, no DB hit per request).
  permissions: string[];
  // Which outlets (physical locations) this employee may select at sign-in —
  // null means unrestricted (every existing employee, pre-Phase-3, has no
  // EmployeeOutlet rows and so is unrestricted by design). Resolved at login
  // time like `permissions`; an outlet assignment change takes effect next
  // login, same as a permission change.
  outletIds: string[] | null;
  // Which tenant this token was minted under (control-DB "platform admin"
  // employees get null). Guards must check this matches the tenant of the
  // request being served — otherwise a token issued for one restaurant (or
  // for no tenant at all, i.e. the platform console) can be replayed against
  // a different one just by changing the X-Tenant header.
  tenantId: string | null;
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
