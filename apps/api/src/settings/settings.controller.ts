import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { SettingsService } from './settings.service';
import { AuthGuard, CurrentEmployee } from '../common/auth.guard';
import { TokenPayload } from '../common/token';

class UpdateSettingsDto {
  @IsOptional() @IsString() restaurantName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() taxId?: string;
  // Rates as fractions: 0.13 = 13%. Capped at 100%.
  @IsOptional() @IsNumber() @Min(0) @Max(1) vatRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) serviceChargeRate?: number;
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
  @IsOptional() @IsObject() billTemplate?: object;
  @IsOptional() @IsObject() kotTemplate?: object;
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

  // Danger zone — wipe all sales/operational data. Admin-only (manage staff).
  @Post('reset-data')
  @UseGuards(new AuthGuard('canManageStaff'))
  resetData(@CurrentEmployee() emp: TokenPayload) {
    return this.settings.resetData({ sub: emp?.sub, name: emp?.name });
  }
}
