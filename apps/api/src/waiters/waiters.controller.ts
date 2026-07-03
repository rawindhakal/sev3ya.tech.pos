import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

class CreateWaiterDto {
  @IsString() @IsNotEmpty() name: string;
}
class UpdateWaiterDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('waiters')
export class WaitersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.waiter.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  create(@Body() dto: CreateWaiterDto) {
    return this.prisma.waiter.create({ data: dto });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWaiterDto) {
    return this.prisma.waiter.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.waiter.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
