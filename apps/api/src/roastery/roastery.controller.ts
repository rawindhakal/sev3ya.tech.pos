import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { RoasteryService } from './roastery.service';

class CreateGreenDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() estate?: string;
  @IsOptional() @IsString() process?: string;
  @IsOptional() @IsNumber() @Min(0) moisturePct?: number;
  @IsNumber() @Min(0) weightKg: number;
  @IsOptional() @IsInt() @Min(0) costPerKgCents?: number;
}
class RoastDto {
  @IsString() @IsNotEmpty() greenBatchId: string;
  @IsNumber() @Min(0) greenInputKg: number;
  @IsNumber() @Min(0) roastedOutputKg: number;
  @IsOptional() @IsNumber() chargeTempC?: number;
  @IsOptional() @IsNumber() dropTempC?: number;
  @IsOptional() @IsInt() devTimeSec?: number;
  @IsOptional() @IsInt() agtron?: number;
  @IsOptional() @IsString() notes?: string;
}
class CupDto {
  @IsString() @IsNotEmpty() greenBatchId: string;
  @IsNumber() @Min(0) @Max(10) aroma: number;
  @IsNumber() @Min(0) @Max(10) flavor: number;
  @IsNumber() @Min(0) @Max(10) acidity: number;
  @IsNumber() @Min(0) @Max(10) body: number;
  @IsNumber() @Min(0) @Max(10) balance: number;
  @IsOptional() @IsString() notes?: string;
}

@Controller('roastery')
export class RoasteryController {
  constructor(private readonly roastery: RoasteryService) {}

  @Get('green')
  green() {
    return this.roastery.greenBatches();
  }
  @Post('green')
  createGreen(@Body() dto: CreateGreenDto) {
    return this.roastery.createGreen(dto);
  }
  @Delete('green/:id')
  removeGreen(@Param('id') id: string) {
    return this.roastery.removeGreen(id);
  }

  @Get('roasts')
  roasts() {
    return this.roastery.roasts();
  }
  @Post('roasts')
  roast(@Body() dto: RoastDto) {
    return this.roastery.roast(dto);
  }

  @Get('cuppings')
  cuppings(@Query('greenBatchId') greenBatchId?: string) {
    return this.roastery.cuppings(greenBatchId);
  }
  @Post('cuppings')
  cup(@Body() dto: CupDto) {
    return this.roastery.cup(dto);
  }
}
