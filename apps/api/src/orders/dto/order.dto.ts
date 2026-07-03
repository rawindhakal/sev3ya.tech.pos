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
  @IsString() @IsNotEmpty() menuItemId: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CartModifierDto)
  modifiers?: CartModifierDto[];
  @IsOptional() @IsString() notes?: string;
}

export class CreateOrderDto {
  @IsEnum(OrderType) type: OrderType;
  @IsOptional() @IsString() tableId?: string;
  @IsOptional() @IsString() waiterId?: string;
  @IsOptional() @IsInt() @Min(1) guestCount?: number;
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
}

export class UpdateOrderDto {
  @IsOptional() @IsString() waiterId?: string;
  @IsOptional() @IsInt() @Min(1) guestCount?: number;
  @IsOptional() @IsString() notes?: string;
}
