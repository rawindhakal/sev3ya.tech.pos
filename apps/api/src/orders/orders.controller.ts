import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AuthGuard, SoftAuthGuard, CurrentEmployee } from '../common/auth.guard';
import type { TokenPayload } from '../common/token';
import {
  CreateOrderDto,
  PayDto,
  RefundDto,
  SaveCartDto,
  UpdateOrderDto,
  VoidDto,
} from './dto/order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  findAll(@Query('status') status?: string, @Query('today') today?: string) {
    return this.orders.findAll({ status, today: today === '1' || today === 'true' });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  @Put(':id/cart')
  saveCart(@Param('id') id: string, @Body() dto: SaveCartDto) {
    return this.orders.saveCart(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(id, dto);
  }

  @Post(':id/kot')
  kot(@Param('id') id: string) {
    return this.orders.sendKot(id);
  }

  @Post(':id/bill')
  bill(@Param('id') id: string) {
    return this.orders.bill(id);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string, @Body() dto: PayDto) {
    return this.orders.pay(id, dto);
  }

  @Post(':id/refund')
  @UseGuards(new AuthGuard('canVoid'))
  refund(@Param('id') id: string, @Body() dto: RefundDto, @CurrentEmployee() emp: TokenPayload) {
    return this.orders.refund(id, dto, emp);
  }

  @Post(':id/transfer')
  transfer(@Param('id') id: string, @Body('tableId') tableId: string) {
    return this.orders.transfer(id, tableId);
  }

  @Post(':id/merge')
  merge(@Param('id') id: string, @Body('fromOrderId') fromOrderId: string) {
    return this.orders.merge(id, fromOrderId);
  }

  // Void (with items → needs canVoid) or discard an empty draft (allowed).
  @Delete(':id')
  @UseGuards(SoftAuthGuard)
  cancel(@Param('id') id: string, @Body() body: VoidDto, @CurrentEmployee() emp: TokenPayload) {
    return this.orders.cancel(id, body, emp);
  }
}
