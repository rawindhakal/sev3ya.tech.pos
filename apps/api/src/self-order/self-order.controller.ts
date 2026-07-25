import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SelfOrderService } from './self-order.service';
import { CartLineDto } from '../orders/dto/order.dto';

class SubmitItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items: CartLineDto[];
  // Optional — captured once on the first submission for this table's
  // order, enables the "order confirmed" / "order ready" SMS.
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
}

@Controller('self-order')
export class SelfOrderController {
  constructor(private readonly selfOrder: SelfOrderService) {}

  @Get('table/:token')
  menu(@Param('token') token: string) {
    return this.selfOrder.menuFor(token);
  }

  @Get('table/:token/order')
  order(@Param('token') token: string) {
    return this.selfOrder.currentOrder(token);
  }

  @Post('table/:token/items')
  submit(@Param('token') token: string, @Body() dto: SubmitItemsDto) {
    return this.selfOrder.submitItems(token, dto.items, dto.customerName, dto.customerPhone);
  }

  @Post('table/:token/call-waiter')
  callWaiter(@Param('token') token: string) {
    return this.selfOrder.callWaiter(token);
  }
}
