import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsOptional() @IsString() restaurantName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() receiptHeader?: string;
  @IsOptional() @IsString() receiptFooter?: string;
  @IsOptional() @IsString() wifiPassword?: string;
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
}
