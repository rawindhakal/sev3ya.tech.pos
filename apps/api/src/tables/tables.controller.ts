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
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TableStatus } from '@prisma/client';
import { TablesService } from './tables.service';

class CreateTableDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
  @IsOptional() @IsString() area?: string;
}

class UpdateTableDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsEnum(TableStatus) status?: TableStatus;
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

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tables.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tables.remove(id);
  }
}
