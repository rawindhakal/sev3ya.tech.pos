import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PrepStation } from '@prisma/client';
import { KdsService } from './kds.service';

@Controller('kds')
export class KdsController {
  constructor(private readonly kds: KdsService) {}

  @Get('tickets')
  tickets() {
    return this.kds.tickets();
  }

  @Get('tokens')
  tokens() {
    return this.kds.tokens();
  }

  @Post('items/:id/ready')
  ready(@Param('id') id: string) {
    return this.kds.markItem(id, 'READY');
  }

  // Undo an accidental "ready" tap.
  @Post('items/:id/unready')
  unready(@Param('id') id: string) {
    return this.kds.unmarkItem(id);
  }

  // ?station=KITCHEN|BAR scopes the bump to just that station's items (used
  // by a per-station filtered KDS screen); omitted = bump the whole order.
  @Post('orders/:id/bump')
  bump(@Param('id') id: string, @Query('station') station?: string) {
    const s = station && (['KITCHEN', 'BAR', 'BILLING'] as const).includes(station as PrepStation) ? (station as PrepStation) : undefined;
    return this.kds.bump(id, s);
  }

  @Post('items/:id/out-of-stock')
  outOfStock(@Param('id') id: string, @Body('menuItemId') menuItemId: string) {
    return this.kds.outOfStock(menuItemId);
  }
}
