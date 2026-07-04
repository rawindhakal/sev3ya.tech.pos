import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { StaffRole } from '@prisma/client';
import { EmployeesService } from './employees.service';

class CreateEmployeeDto {
  @IsString() @IsNotEmpty() name: string;
  @IsEnum(StaffRole) role: StaffRole;
  @Matches(/^\d{4,6}$/, { message: 'PIN must be 4–6 digits' }) pin: string;
  @IsOptional() @IsBoolean() canVoid?: boolean;
  @IsOptional() @IsBoolean() canDiscount?: boolean;
  @IsOptional() @IsBoolean() canManageInventory?: boolean;
  @IsOptional() @IsBoolean() canViewReports?: boolean;
  @IsOptional() @IsBoolean() canManageStaff?: boolean;
}
class UpdateEmployeeDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsEnum(StaffRole) role?: StaffRole;
  @IsOptional() @Matches(/^\d{4,6}$/) pin?: string;
  @IsOptional() @IsBoolean() canVoid?: boolean;
  @IsOptional() @IsBoolean() canDiscount?: boolean;
  @IsOptional() @IsBoolean() canManageInventory?: boolean;
  @IsOptional() @IsBoolean() canViewReports?: boolean;
  @IsOptional() @IsBoolean() canManageStaff?: boolean;
}
class LoginDto {
  @Matches(/^\d{4,6}$/) pin: string;
}

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  findAll() {
    return this.employees.findAll();
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.employees.login(dto.pin);
  }

  @Get('active-shifts')
  activeShifts() {
    return this.employees.activeShifts();
  }

  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employees.remove(id);
  }

  @Post(':id/clock-in')
  clockIn(@Param('id') id: string) {
    return this.employees.clockIn(id);
  }

  @Post(':id/clock-out')
  clockOut(@Param('id') id: string) {
    return this.employees.clockOut(id);
  }

  @Get(':id/shifts')
  shifts(@Param('id') id: string) {
    return this.employees.shifts(id);
  }
}
