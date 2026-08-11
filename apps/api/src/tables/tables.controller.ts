import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { TableStatus } from '@prisma/client';
import { TablesService } from './tables.service';
import { CurrentOutlet } from '../common/auth.guard';

class CreateTableDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsBoolean() isVip?: boolean;
}

class UpdateTableDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsEnum(TableStatus) status?: TableStatus;
  @IsOptional() @IsBoolean() isVip?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) posX?: number;
  @IsOptional() @IsInt() @Min(0) posY?: number;
}

class RenameAreaDto {
  @IsString() @IsNotEmpty() name: string;
}

class PositionDto {
  @IsString() @IsNotEmpty() id: string;
  @IsInt() @Min(0) posX: number;
  @IsInt() @Min(0) posY: number;
}
class SaveLayoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PositionDto)
  positions: PositionDto[];
}

@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  findAll(
    @Query('groupBy') groupBy?: string,
    @Query('outletId') outletId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const withInactive = includeInactive === '1' || includeInactive === 'true';
    return groupBy === 'area' ? this.tables.findByArea(outletId, withInactive) : this.tables.findAll(outletId, withInactive);
  }

  // Area names + table counts — for the Tables & Areas management page.
  // Must stay before nothing in particular (no :id GET exists on this
  // controller), but kept near the other area routes for readability.
  @Get('areas')
  listAreas(@Query('outletId') outletId?: string) {
    return this.tables.listAreas(outletId);
  }
  @Patch('areas/:name')
  renameArea(@Param('name') name: string, @Body() dto: RenameAreaDto, @CurrentOutlet() outletId?: string) {
    return this.tables.renameArea(name, dto.name, outletId);
  }
  @Delete('areas/:name')
  dissolveArea(@Param('name') name: string, @CurrentOutlet() outletId?: string) {
    return this.tables.dissolveArea(name, outletId);
  }

  @Post()
  create(@Body() dto: CreateTableDto, @CurrentOutlet() outletId?: string) {
    return this.tables.create({ ...dto, outletId });
  }

  // Persist floor-plan positions for many tables at once (matrix #26).
  @Post('layout')
  saveLayout(@Body() dto: SaveLayoutDto) {
    return this.tables.saveLayout(dto.positions);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tables.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tables.remove(id);
  }

  // Generate (or return the existing) QR self-order token for a table.
  @Post(':id/qr')
  getQr(@Param('id') id: string) {
    return this.tables.ensureQrToken(id);
  }

  // "Call waiter" — surfaced to staff (waiter/POS screens poll this).
  @Get('waiter-calls')
  waiterCalls() {
    return this.tables.waiterCalls();
  }
  @Post('waiter-calls/:callId/acknowledge')
  acknowledgeCall(@Param('callId') callId: string) {
    return this.tables.acknowledgeWaiterCall(callId);
  }
  @Post('waiter-calls/:callId/resolve')
  resolveCall(@Param('callId') callId: string) {
    return this.tables.resolveWaiterCall(callId);
  }
}
