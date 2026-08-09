import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OutletsService } from './outlets.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';

class CreateOutletDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() receiptHeader?: string;
  @IsOptional() @IsString() receiptFooter?: string;
}
class UpdateOutletDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() receiptHeader?: string;
  @IsOptional() @IsString() receiptFooter?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class TerminalDto {
  @IsString() @IsNotEmpty() name: string;
}
class UpdateTerminalDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller()
export class OutletsController {
  constructor(private readonly outlets: OutletsService) {}

  // Open to any authenticated employee (not gated by outlets.manage) — every
  // till needs this list to populate the outlet/terminal picker at sign-in,
  // not just admins who can edit outlets.
  @Get('outlets')
  findAll() {
    return this.outlets.findAll();
  }

  @Post('outlets')
  @UseGuards(new PermissionGuard(PERMISSIONS.OUTLETS_MANAGE))
  create(@Body() dto: CreateOutletDto) {
    return this.outlets.create(dto);
  }

  @Patch('outlets/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.OUTLETS_MANAGE))
  update(@Param('id') id: string, @Body() dto: UpdateOutletDto) {
    return this.outlets.update(id, dto);
  }

  @Delete('outlets/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.OUTLETS_MANAGE))
  remove(@Param('id') id: string) {
    return this.outlets.remove(id);
  }

  @Post('outlets/:id/terminals')
  @UseGuards(new PermissionGuard(PERMISSIONS.OUTLETS_MANAGE))
  createTerminal(@Param('id') id: string, @Body() dto: TerminalDto) {
    return this.outlets.createTerminal(id, dto);
  }

  @Patch('terminals/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.OUTLETS_MANAGE))
  updateTerminal(@Param('id') id: string, @Body() dto: UpdateTerminalDto) {
    return this.outlets.updateTerminal(id, dto);
  }

  @Delete('terminals/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.OUTLETS_MANAGE))
  removeTerminal(@Param('id') id: string) {
    return this.outlets.removeTerminal(id);
  }
}
