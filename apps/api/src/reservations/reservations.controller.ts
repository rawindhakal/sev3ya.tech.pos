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
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ReservationsService } from './reservations.service';

class CreateReservationDto {
  @IsString() @IsNotEmpty() customerName: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsInt() @Min(1) partySize?: number;
  @IsOptional() @IsString() reservedAt?: string;
  @IsOptional() @IsString() tableId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isWaitlist?: boolean;
}

class UpdateReservationDto {
  @IsOptional() @IsString() tableId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() reservedAt?: string;
  @IsOptional() @IsInt() @Min(1) partySize?: number;
}

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  findAll(@Query('date') date?: string, @Query('status') status?: string) {
    return this.reservations.findAll({ date, status });
  }

  @Get('waitlist')
  waitlist() {
    return this.reservations.waitlist();
  }

  @Post()
  create(@Body() dto: CreateReservationDto) {
    return this.reservations.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReservationDto) {
    return this.reservations.update(id, dto);
  }

  @Post(':id/seat')
  seat(@Param('id') id: string) {
    return this.reservations.seat(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.reservations.setStatus(id, 'CANCELLED');
  }

  @Post(':id/no-show')
  noShow(@Param('id') id: string) {
    return this.reservations.setStatus(id, 'NO_SHOW');
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reservations.remove(id);
  }
}
