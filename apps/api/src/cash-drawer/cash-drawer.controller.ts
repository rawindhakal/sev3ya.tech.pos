import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashDrawerService } from './cash-drawer.service';
import { PermissionGuard, CurrentEmployee, CurrentTerminal } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';
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
  current(@Query('terminalId') terminalId?: string, @CurrentTerminal() headerTerminalId?: string) {
    return this.drawer.current(terminalId ?? headerTerminalId);
  }

  @Get('sessions')
  history() {
    return this.drawer.history();
  }

  // Z-report for the current (or a given) session's business day.
  @Get('report')
  report(@Query('sessionId') sessionId?: string, @Query('terminalId') terminalId?: string, @CurrentTerminal() headerTerminalId?: string) {
    return this.drawer.report(sessionId, terminalId ?? headerTerminalId);
  }

  @Get('sessions/:id')
  findOne(@Param('id') id: string) {
    return this.drawer.findOne(id);
  }

  @Post('open')
  open(@Body() dto: OpenDto, @CurrentTerminal() headerTerminalId?: string) {
    return this.drawer.open({ ...dto, terminalId: dto.terminalId ?? headerTerminalId });
  }

  @Post('movement')
  movement(@Body() dto: MovementDto, @CurrentTerminal() headerTerminalId?: string) {
    return this.drawer.addMovement({ ...dto, terminalId: dto.terminalId ?? headerTerminalId });
  }

  @Post('close')
  close(@Body() dto: CloseDto, @CurrentTerminal() headerTerminalId?: string) {
    return this.drawer.close({ ...dto, terminalId: dto.terminalId ?? headerTerminalId });
  }

  // Admin can correct the opening balance of the open session at any time.
  @Patch('opening-float')
  @UseGuards(new PermissionGuard(PERMISSIONS.CASH_DRAWER_ADJUST_FLOAT))
  adjustOpeningFloat(
    @Body() dto: { openingFloatCents: number },
    @CurrentEmployee() emp: TokenPayload,
  ) {
    return this.drawer.adjustOpeningFloat(Number(dto.openingFloatCents), emp);
  }
}
