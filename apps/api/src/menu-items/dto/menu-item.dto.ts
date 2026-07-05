import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PrepStation } from '@prisma/client';

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

  // Optional list of ModifierGroup ids to attach.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modifierGroupIds?: string[];
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
  @IsArray()
  @IsString({ each: true })
  modifierGroupIds?: string[];
}
