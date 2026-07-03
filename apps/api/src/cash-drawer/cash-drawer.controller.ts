import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashDrawerService } from './cash-drawer.service';

class OpenDto {
  @IsInt() @Min(0) openingFloatCents: number;
  @IsOptional() @IsString() openedBy?: string;
}
class MovementDto {
  @IsEnum({ PAY_IN: 'PAY_IN', PAY_OUT: 'PAY_OUT' })
  type: 'PAY_IN' | 'PAY_OUT';
  @IsInt() @Min(1) amountCents: number;
  @IsOptional() @IsString() reason?: string;
}
class CloseDto {
  @IsInt() @Min(0) countedCents: number;
  @IsOptional() @IsString() closedBy?: string;
  @IsOptional() @IsString() notes?: string;
}

@Controller('cash-drawer')
export class CashDrawerController {
  constructor(private readonly drawer: CashDrawerService) {}

  @Get('current')
  current() {
    return this.drawer.current();
  }

  @Get('sessions')
  history() {
    return this.drawer.history();
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
}
