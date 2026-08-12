import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { SettingsService } from './settings.service';
import { PermissionGuard, CurrentEmployee } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';
import { TokenPayload } from '../common/token';

class ResetDataDto {
  @IsOptional() @IsArray() @IsIn(SettingsService.RESET_CATEGORIES, { each: true }) categories?: string[];
}

class DiscountPresetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['PCT', 'RS']) type?: 'PCT' | 'RS';
  @IsOptional() @IsInt() @Min(0) value?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

class UpdateSettingsDto {
  @IsOptional() @IsString() restaurantName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() taxId?: string;
  // Rates as fractions: 0.13 = 13%. Capped at 100%.
  @IsOptional() @IsNumber() @Min(0) @Max(1) vatRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) serviceChargeRate?: number;
  @IsOptional() @IsBoolean() pricesIncludeVat?: boolean;
  @IsOptional() @IsString() currencySymbol?: string;
  @IsOptional() @IsNumber() @Min(1) defaultGuestCount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(180) targetTicketMinutes?: number;
  @IsOptional() @IsString() receiptHeader?: string;
  @IsOptional() @IsString() receiptFooter?: string;
  @IsOptional() @IsString() wifiPassword?: string;
  @IsOptional() @IsBoolean() featReservations?: boolean;
  @IsOptional() @IsBoolean() featInventory?: boolean;
  @IsOptional() @IsBoolean() featPurchasing?: boolean;
  @IsOptional() @IsBoolean() featRoastery?: boolean;
  @IsOptional() @IsBoolean() featModifiers?: boolean;
  @IsOptional() @IsBoolean() featCrm?: boolean;
  @IsOptional() @IsBoolean() featFinance?: boolean;
  @IsOptional() @IsBoolean() featKds?: boolean;
  @IsOptional() @IsBoolean() featSelfOrder?: boolean;
  @IsOptional() @IsObject() billTemplate?: object;
  @IsOptional() @IsObject() kotTemplate?: object;
  @IsOptional() @IsBoolean() irdEnabled?: boolean;
  @IsOptional() @IsString() irdUsername?: string;
  @IsOptional() @IsString() irdPassword?: string;
  @IsOptional() @IsString() irdSellerPan?: string;
  @IsOptional() @IsString() irdApiUrl?: string;
  @IsOptional() @IsInt() @Min(0) packagingChargeCents?: number;
  @IsOptional() @IsInt() @Min(0) deliveryChargeCents?: number;
  @IsOptional() @IsString() esewaMerchantCode?: string;
  @IsOptional() @IsString() esewaSecretKey?: string;
  @IsOptional() @IsString() khaltiPublicKey?: string;
  @IsOptional() @IsString() khaltiSecretKey?: string;
  @IsOptional() @IsString() fonepayMerchantCode?: string;
  @IsOptional() @IsString() fonepaySecretKey?: string;
  @IsOptional() @IsString() smsGatewayApiKey?: string;
  @IsOptional() @IsString() smsGatewaySenderId?: string;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  // Danger zone — wipe selected sales/operational data categories. Admin-only.
  @Post('reset-data')
  @UseGuards(new PermissionGuard(PERMISSIONS.SETTINGS_MANAGE))
  resetData(@Body() dto: ResetDataDto, @CurrentEmployee() emp: TokenPayload) {
    return this.settings.resetData(dto.categories ?? [], { sub: emp?.sub, name: emp?.name });
  }

  // ── Discount presets (any signed-in staff can read for the POS modal) ──
  @Get('discount-presets')
  discountPresets(@Query('active') active?: string) {
    return this.settings.discountPresets(active === '1');
  }

  @Post('discount-presets')
  @UseGuards(new PermissionGuard(PERMISSIONS.SETTINGS_MANAGE))
  createDiscountPreset(@Body() dto: DiscountPresetDto) {
    if (!dto.name?.trim() || dto.value == null) throw new BadRequestException('name and value are required');
    return this.settings.createDiscountPreset({ name: dto.name.trim(), type: dto.type ?? 'PCT', value: dto.value, sortOrder: dto.sortOrder });
  }

  @Patch('discount-presets/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.SETTINGS_MANAGE))
  updateDiscountPreset(@Param('id') id: string, @Body() dto: DiscountPresetDto) {
    return this.settings.updateDiscountPreset(id, dto);
  }

  @Delete('discount-presets/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.SETTINGS_MANAGE))
  deleteDiscountPreset(@Param('id') id: string) {
    return this.settings.deleteDiscountPreset(id);
  }
}
