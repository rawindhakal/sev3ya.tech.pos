import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { EmployeesService } from './employees.service';
import { Public } from '../common/public.decorator';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';

class CreateEmployeeDto {
  @IsOptional() @IsString() deviceUserId?: string;
  @IsOptional() @IsInt() @Min(0) monthlySalaryCents?: number;
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() roleId: string;
  @IsString() @IsNotEmpty() username: string;
  @IsString() @IsNotEmpty() password: string;
}
class UpdateEmployeeDto {
  @IsOptional() @IsString() deviceUserId?: string;
  @IsOptional() @IsInt() @Min(0) monthlySalaryCents?: number;
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() roleId?: string;
  @IsOptional() @IsString() @IsNotEmpty() username?: string;
  @IsOptional() @IsString() password?: string;
}
class LoginDto {
  @IsString() @IsNotEmpty() username: string;
  @IsString() @IsNotEmpty() password: string;
}
class SetOutletsDto {
  @IsArray() @IsString({ each: true }) outletIds: string[];
}

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  findAll() {
    return this.employees.findAll();
  }

  // Complements the per-account lockout in common/login-throttle.ts (which
  // only stops repeated guesses against ONE username) — this caps attempts
  // per IP regardless of which username is being tried, catching distributed
  // guessing/credential stuffing across many accounts.
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.employees.login(dto);
  }

  @Get('active-shifts')
  activeShifts() {
    return this.employees.activeShifts();
  }

  // Creating/editing/deactivating staff (incl. their assigned role) is a
  // privilege-escalation-sensitive action — restrict to holders of the
  // staff.manage permission, not just "any signed-in employee".
  @Post()
  @UseGuards(new PermissionGuard(PERMISSIONS.STAFF_MANAGE))
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Patch(':id')
  @UseGuards(new PermissionGuard(PERMISSIONS.STAFF_MANAGE))
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(new PermissionGuard(PERMISSIONS.STAFF_MANAGE))
  remove(@Param('id') id: string) {
    return this.employees.remove(id);
  }

  // Multi-outlet (Phase 3): which outlets this employee may select at
  // sign-in — empty = unrestricted. Gated by outlets.manage, not
  // staff.manage, matching that permission's "assign staff to outlets" scope.
  @Patch(':id/outlets')
  @UseGuards(new PermissionGuard(PERMISSIONS.OUTLETS_MANAGE))
  setOutlets(@Param('id') id: string, @Body() dto: SetOutletsDto) {
    return this.employees.setOutlets(id, dto.outletIds ?? []);
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
