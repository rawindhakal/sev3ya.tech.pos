import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchasingService } from './purchasing.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';

class SupplierDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxId?: string;
}
class POLineDto {
  @IsString() @IsNotEmpty() ingredientId: string;
  @IsNumber() @Min(0) quantity: number;
  @IsInt() @Min(0) unitCostCents: number;
}
class CreatePODto {
  @IsString() @IsNotEmpty() supplierId: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => POLineDto) lines: POLineDto[];
}
class ReceiptLineDto {
  @IsString() @IsNotEmpty() lineId: string;
  @IsNumber() @Min(0) receiveQty: number;
}
class ReceiveDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiptLineDto) receipts: ReceiptLineDto[];
}
class SupplierPaymentDto {
  @IsInt() @Min(1) amountCents: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() note?: string;
}

@Controller()
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  // Suppliers
  @Get('suppliers')
  suppliers() {
    return this.purchasing.suppliers();
  }
  @Post('suppliers')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  createSupplier(@Body() dto: SupplierDto) {
    return this.purchasing.createSupplier(dto);
  }
  @Patch('suppliers/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  updateSupplier(@Param('id') id: string, @Body() dto: SupplierDto) {
    return this.purchasing.updateSupplier(id, dto);
  }
  @Delete('suppliers/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  removeSupplier(@Param('id') id: string) {
    return this.purchasing.removeSupplier(id);
  }

  // Vendor payment ledger
  @Get('purchasing/vendor-ledger')
  vendorLedger() {
    return this.purchasing.vendorLedger();
  }
  @Get('suppliers/:id/payments')
  supplierPayments(@Param('id') id: string) {
    return this.purchasing.supplierPayments(id);
  }
  @Post('suppliers/:id/payments')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  recordPayment(@Param('id') id: string, @Body() dto: SupplierPaymentDto) {
    return this.purchasing.recordPayment(id, dto);
  }

  // Purchase orders
  @Get('purchase-orders')
  orders(@Query('status') status?: string) {
    return this.purchasing.orders(status);
  }
  @Get('purchase-orders/:id')
  order(@Param('id') id: string) {
    return this.purchasing.order(id);
  }
  @Post('purchase-orders')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  createOrder(@Body() dto: CreatePODto) {
    return this.purchasing.createOrder(dto);
  }
  @Post('purchase-orders/auto-generate')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  autoGenerate() {
    return this.purchasing.autoGenerate();
  }
  @Post('purchase-orders/:id/order')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  markOrdered(@Param('id') id: string) {
    return this.purchasing.markOrdered(id);
  }
  @Post('purchase-orders/:id/receive')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  receive(@Param('id') id: string, @Body() dto: ReceiveDto) {
    return this.purchasing.receive(id, dto.receipts);
  }
  @Post('purchase-orders/:id/cancel')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  cancel(@Param('id') id: string) {
    return this.purchasing.cancel(id);
  }
}
