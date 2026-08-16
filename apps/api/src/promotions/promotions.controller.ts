import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsISO8601, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { CouponType } from '@prisma/client';
import { PromotionsService } from './promotions.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';
import { Public } from '../common/public.decorator';
import { RequireFeature } from '../common/feature.decorator';

class CreateCouponDto {
  @IsString() @IsNotEmpty() code: string;
  @IsEnum(CouponType) type: CouponType;
  @IsInt() @Min(0) value: number;
  @IsOptional() @IsInt() @Min(0) minOrderCents?: number;
  @IsOptional() @IsInt() @Min(1) maxUsesTotal?: number;
  @IsOptional() @IsInt() @Min(1) maxUsesPerCustomer?: number;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
class UpdateCouponDto {
  @IsOptional() @IsEnum(CouponType) type?: CouponType;
  @IsOptional() @IsInt() @Min(0) value?: number;
  @IsOptional() @IsInt() @Min(0) minOrderCents?: number;
  @IsOptional() @IsInt() @Min(1) maxUsesTotal?: number;
  @IsOptional() @IsInt() @Min(1) maxUsesPerCustomer?: number;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class PreviewCouponDto {
  @IsString() @IsNotEmpty() code: string;
  @IsInt() @Min(0) subtotalCents: number;
  @IsOptional() @IsString() customerId?: string;
}

@RequireFeature('marketing')
@Controller('promotions/coupons')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list() {
    return this.promotions.coupons();
  }

  @Post()
  @UseGuards(new PermissionGuard(PERMISSIONS.PROMOTIONS_MANAGE))
  create(@Body() dto: CreateCouponDto) {
    return this.promotions.createCoupon(dto);
  }

  @Patch(':id')
  @UseGuards(new PermissionGuard(PERMISSIONS.PROMOTIONS_MANAGE))
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.promotions.updateCoupon(id, dto);
  }

  @Delete(':id')
  @UseGuards(new PermissionGuard(PERMISSIONS.PROMOTIONS_MANAGE))
  remove(@Param('id') id: string) {
    return this.promotions.deleteCoupon(id);
  }

  // Preview a coupon's discount without redeeming it — used by POS/self-order
  // before actually applying (no auth: also called from the public self-order flow).
  @Public()
  @Post('preview')
  preview(@Body() dto: PreviewCouponDto) {
    return this.promotions.preview(dto.code, dto.subtotalCents, dto.customerId);
  }
}
