import { NextFunction, Request, Response } from 'express';

// Minimal hardening headers (a hand-rolled subset of what `helmet` sets) —
// avoids adding a dependency in a sandbox with no outbound network access.
// This is a pure JSON API with no server-rendered HTML, so the highest-value
// headers are the ones that stop a browser from doing something unexpected
// with an API response (MIME-sniffing it as HTML/script, framing it, etc).
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}
