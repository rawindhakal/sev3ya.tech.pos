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
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CrmService } from './crm.service';

class CreateCustomerDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() birthday?: string;
}
class UpdateCustomerDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() optIn?: boolean;
  @IsOptional() @IsString() birthday?: string;
}

@Controller('customers')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get()
  findAll(@Query('search') search?: string) {
    return this.crm.findAll(search);
  }
  @Get('stats')
  stats() {
    return this.crm.stats();
  }
  @Get('lookup')
  lookup(@Query('phone') phone: string) {
    return this.crm.lookup(phone);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.crm.findOne(id);
  }
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.crm.create(dto);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.crm.update(id, dto);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.crm.remove(id);
  }
}
