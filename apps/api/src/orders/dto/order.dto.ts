import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderType, PaymentMethod } from '@prisma/client';

export class CartModifierDto {
  @IsString() @IsNotEmpty() name: string;
  @IsInt() priceCents: number;
}

export class CartLineDto {
  // Existing order-item id (for reconcile; preserves KOT/fired status).
  @IsOptional() @IsString() id?: string;
  // Either menuItemId (menu item) OR name+unitPriceCents (open item, #16).
  @IsOptional() @IsString() @IsNotEmpty() menuItemId?: string;
  @IsOptional() @IsString() variantId?: string; // chosen portion (30ml/60ml)
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsInt() @Min(0) unitPriceCents?: number;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsInt() @Min(0) discountCents?: number; // item-wise discount
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CartModifierDto)
  modifiers?: CartModifierDto[];
  @IsOptional() @IsString() notes?: string;
}

export class CancelItemDto {
  @IsString() @IsNotEmpty() reason: string;
}

export class AttachCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsString() @IsNotEmpty() phone: string;
}

export class CreateOrderDto {
  @IsEnum(OrderType) type: OrderType;
  @IsOptional() @IsString() tableId?: string;
  @IsOptional() @IsString() waiterId?: string;
  @IsOptional() @IsInt() @Min(1) guestCount?: number;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() terminalId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CartLineDto)
  items?: CartLineDto[];
}

export class SaveCartDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CartLineDto)
  items: CartLineDto[];
  @IsOptional() @IsInt() @Min(0) discountCents?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() waiterId?: string;
  @IsOptional() @IsInt() @Min(1) guestCount?: number;
}

export class PaymentLineDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsInt() @Min(0) amountCents: number;
}

export class PayDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentLineDto)
  payments: PaymentLineDto[];
  // Optional loyalty redemption (already reflected in the order discount).
  @IsOptional() @IsInt() @Min(0) redeemPoints?: number;
  @IsOptional() @IsString() customerPhone?: string;
}

export class UpdateOrderDto {
  @IsOptional() @IsString() waiterId?: string;
  @IsOptional() @IsInt() @Min(1) guestCount?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
}

export class VoidDto {
  // Mandatory once the order has items (enforced in the service); an empty
  // brand-new draft can be discarded without a reason.
  @IsOptional() @IsString() reason?: string;
}

export class RefundDto {
  @IsString() @IsNotEmpty() reason: string;
  // Optional partial refund amount; defaults to the full order total.
  @IsOptional() @IsInt() @Min(1) amountCents?: number;
}
