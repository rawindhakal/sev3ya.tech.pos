import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashDrawerService } from './cash-drawer.service';
import { RoleGuard, CurrentEmployee } from '../common/auth.guard';
import { TokenPayload } from '../common/token';

class OpenDto {
  @IsInt() @Min(0) openingFloatCents: number;
  @IsOptional() @IsString() openedBy?: string;
  @IsOptional() @IsString() terminalId?: string;
}
class MovementDto {
  @IsEnum({ PAY_IN: 'PAY_IN', PAY_OUT: 'PAY_OUT' })
  type: 'PAY_IN' | 'PAY_OUT';
  @IsInt() @Min(1) amountCents: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() terminalId?: string;
}
class CloseDto {
  @IsInt() @Min(0) countedCents: number;
  @IsOptional() @IsString() closedBy?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terminalId?: string;
}

@Controller('cash-drawer')
export class CashDrawerController {
  constructor(private readonly drawer: CashDrawerService) {}

  @Get('current')
  current(@Query('terminalId') terminalId?: string) {
    return this.drawer.current(terminalId);
  }

  @Get('sessions')
  history() {
    return this.drawer.history();
  }

  // Z-report for the current (or a given) session's business day.
  @Get('report')
  report(@Query('sessionId') sessionId?: string, @Query('terminalId') terminalId?: string) {
    return this.drawer.report(sessionId, terminalId);
  }

  @Get('sessions/:id')
  findOne(@Param('id') id: string) {
    return this.drawer.findOne(id);
  }

  @Post('open')
  open(@Body() dto: OpenDto) {
    return this.drawer.open(dto);
  }

  @Post('movement')
  movement(@Body() dto: MovementDto) {
    return this.drawer.addMovement(dto);
  }

  @Post('close')
  close(@Body() dto: CloseDto) {
    return this.drawer.close(dto);
  }

  // Admin can correct the opening balance of the open session at any time.
  @Patch('opening-float')
  @UseGuards(new RoleGuard(['ADMIN']))
  adjustOpeningFloat(
    @Body() dto: { openingFloatCents: number },
    @CurrentEmployee() emp: TokenPayload,
  ) {
    return this.drawer.adjustOpeningFloat(Number(dto.openingFloatCents), emp);
  }
}
