import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post('orders/:id/bump')
  bump(@Param('id') id: string) {
    return this.kds.bump(id);
  }

  @Post('items/:id/out-of-stock')
  outOfStock(@Param('id') id: string, @Body('menuItemId') menuItemId: string) {
    return this.kds.outOfStock(menuItemId);
  }
}
