import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrepStation } from '@prisma/client';

export class VariantDto {
  @IsString() @IsNotEmpty() name: string;
  @IsInt() @Min(0) priceCents: number;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class ComboComponentDto {
  @IsString() @IsNotEmpty() menuItemId: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
}

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Price in cents (minor units). Base = dine-in.
  @IsInt()
  @Min(0)
  priceCents: number;

  // Optional per-order-type overrides (matrix #15).
  @IsOptional()
  @IsInt()
  @Min(0)
  takeawayPriceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryPriceCents?: number;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsEnum(PrepStation)
  station?: PrepStation;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  // Overrides both the till's station printer and Category.printerName —
  // e.g. two kitchen printers (K1/K2), route this one dish to K1
  // specifically. Null/omitted falls back to the category default.
  @IsOptional()
  @IsString()
  printerName?: string | null;

  // Optional list of ModifierGroup ids to attach.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modifierGroupIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];

  // Combo/meal-deal (matrix gap #2): sold as one line, but bundles other
  // menu items — their recipes get deducted from inventory on sale.
  @IsOptional()
  @IsBoolean()
  isCombo?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboComponentDto)
  comboItems?: ComboComponentDto[];
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  takeawayPriceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryPriceCents?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;

  @IsOptional()
  @IsEnum(PrepStation)
  station?: PrepStation;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  printerName?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modifierGroupIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];

  @IsOptional()
  @IsBoolean()
  isCombo?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboComponentDto)
  comboItems?: ComboComponentDto[];
}
