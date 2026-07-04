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
  @IsOptional() @IsInt() @Min(0) posX?: number;
  @IsOptional() @IsInt() @Min(0) posY?: number;
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
  findAll(@Query('groupBy') groupBy?: string) {
    return groupBy === 'area' ? this.tables.findByArea() : this.tables.findAll();
  }

  @Post()
  create(@Body() dto: CreateTableDto) {
    return this.tables.create(dto);
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
}
