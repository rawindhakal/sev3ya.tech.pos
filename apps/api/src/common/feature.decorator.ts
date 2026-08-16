import { SetMetadata } from '@nestjs/common';

// Keys mirror CafeSetting's feat* columns (see settings.service.ts's
// `features:` mapping) — one flag per standalone module that can be
// switched off from Settings. Not every feat* column has a decorator use
// (e.g. modifiers is core POS behavior, not a gateable module).
export type FeatureKey =
  | 'reservations'
  | 'inventory'
  | 'purchasing'
  | 'roastery'
  | 'crm'
  | 'finance'
  | 'kds'
  | 'marketing'
  | 'hrm';

export const REQUIRE_FEATURE_KEY = 'requireFeature';

// Marks a controller or handler as gated behind a Settings feature toggle —
// read by DefaultAuthGuard, same Reflector idiom as @Public().
export const RequireFeature = (key: FeatureKey) => SetMetadata(REQUIRE_FEATURE_KEY, key);
