import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { CrmService } from './crm.service';
import { RoleGuard, CurrentEmployee } from '../common/auth.guard';
import { TokenPayload } from '../common/token';

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
class SettleCreditDto {
  @IsInt() @Min(1) amountCents: number;
  @IsOptional() @IsIn(['CASH', 'FONEPAY', 'BANK', 'ESEWA', 'KHALTI', 'CARD'])
  method?: 'CASH' | 'FONEPAY' | 'BANK' | 'ESEWA' | 'KHALTI' | 'CARD';
  @IsOptional() @IsString() note?: string;
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
  // Credit settlement is a money-handling override — manager/admin sign-in only.
  @Post(':id/settle-credit')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  settleCredit(
    @Param('id') id: string,
    @Body() dto: SettleCreditDto,
    @CurrentEmployee() emp?: TokenPayload,
  ) {
    return this.crm.settleCredit(id, dto.amountCents, dto.method ?? 'CASH', dto.note, emp?.name);
  }

  @Get(':id/ledger')
  ledger(@Param('id') id: string) {
    return this.crm.ledger(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.crm.remove(id);
  }
}
