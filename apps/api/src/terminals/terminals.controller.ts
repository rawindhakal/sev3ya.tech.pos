import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

class CreateTerminalDto {
  @IsString() @IsNotEmpty() name: string;
}

@Controller('terminals')
export class TerminalsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.terminal.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  create(@Body() dto: CreateTerminalDto) {
    return this.prisma.terminal.create({ data: { name: dto.name.trim() } });
  }
}
