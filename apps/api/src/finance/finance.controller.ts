import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ExpenseCategory } from '@prisma/client';
import { FinanceService } from './finance.service';

class CreateExpenseDto {
  @IsEnum(ExpenseCategory) category: ExpenseCategory;
  @IsInt() @Min(1) amountCents: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() incurredAt?: string;
}

@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('pnl')
  pnl(@Query('from') from?: string, @Query('to') to?: string) {
    return this.finance.pnl(from, to);
  }

  @Get('ap-aging')
  apAging() {
    return this.finance.apAging();
  }

  @Get('expenses')
  expenses(@Query('from') from?: string, @Query('to') to?: string) {
    return this.finance.expenses(from, to);
  }
  @Post('expenses')
  create(@Body() dto: CreateExpenseDto) {
    return this.finance.createExpense(dto);
  }
  @Delete('expenses/:id')
  remove(@Param('id') id: string) {
    return this.finance.removeExpense(id);
  }
}
