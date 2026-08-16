import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PrepStation } from '@prisma/client';
import { KdsService } from './kds.service';
import { RequireFeature } from '../common/feature.decorator';

@RequireFeature('kds')
@Controller('kds')
export class KdsController {
  constructor(private readonly kds: KdsService) {}

  // ?outletId= scopes the board to one location (multi-outlet, Phase 3) —
  // the POS/KDS frontend always sends its resolved outlet once more than one
  // outlet exists; omitted = every outlet (single-outlet tenants, unchanged).
  @Get('tickets')
  tickets(@Query('outletId') outletId?: string) {
    return this.kds.tickets(outletId);
  }

  @Get('tokens')
  tokens(@Query('outletId') outletId?: string) {
    return this.kds.tokens(outletId);
  }

  @Post('items/:id/ready')
  ready(@Param('id') id: string, @Query('outletId') outletId?: string) {
    return this.kds.markItem(id, 'READY', outletId);
  }

  // Undo an accidental "ready" tap.
  @Post('items/:id/unready')
  unready(@Param('id') id: string, @Query('outletId') outletId?: string) {
    return this.kds.unmarkItem(id, outletId);
  }

  // ?station=KITCHEN|BAR scopes the bump to just that station's items (used
  // by a per-station filtered KDS screen); omitted = bump the whole order.
  @Post('orders/:id/bump')
  bump(@Param('id') id: string, @Query('station') station?: string, @Query('outletId') outletId?: string) {
    const s = station && (['KITCHEN', 'BAR', 'BILLING'] as const).includes(station as PrepStation) ? (station as PrepStation) : undefined;
    return this.kds.bump(id, s, outletId);
  }

  @Post('items/:id/out-of-stock')
  outOfStock(@Param('id') id: string, @Body('menuItemId') menuItemId: string) {
    return this.kds.outOfStock(menuItemId);
  }
}
