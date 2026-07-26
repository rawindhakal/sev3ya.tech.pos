import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PublicController } from './public.controller';
import { PlatformService } from './platform.service';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  controllers: [PlatformController, PublicController],
  providers: [PlatformService, TenantMiddleware],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // '*' alone does NOT reach routes excluded from the global /api prefix
    // (setGlobalPrefix's `exclude` list — see main.ts for /iclock/*) — Nest
    // resolves wildcard middleware matching against the prefixed route
    // table, so an excluded-prefix route silently never sees this
    // middleware unless its pattern is also listed explicitly here.
    //
    // The pattern has to be 'iclock/*' specifically — two different things
    // both need it to look like that:
    //  - Nest's own exclude-list matcher (built from main.ts's `exclude:
    //    'iclock/(.*)'`) needs to recognize this middleware path as "also
    //    excluded from the prefix" so it doesn't silently prepend /api to
    //    it; 'iclock' alone (no wildcard) fails that check since the regex
    //    requires a trailing segment after iclock/.
    //  - Express 4.21+ bundles a stricter path-to-regexp that dropped the
    //    old bare-group syntax ('iclock/(.*)') — it registers without
    //    error but then never actually matches a request. Confirmed
    //    empirically ('iclock/*splat', 'iclock/(.*)' both silently no-op;
    //    only the bare 'iclock/*' wildcard matches in this express version).
    consumer.apply(TenantMiddleware).forRoutes('*', { path: 'iclock/*', method: RequestMethod.ALL });
  }
}
