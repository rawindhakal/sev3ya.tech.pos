import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS, PERMISSION_CATALOG } from '../common/permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // Read access is gated by staff.manage, not roles.manage — anyone who can
  // create/edit an employee needs this list for the role-assignment dropdown,
  // even if they can't edit the roles themselves.
  @Get()
  @UseGuards(new PermissionGuard(PERMISSIONS.STAFF_MANAGE))
  findAll() {
    return this.roles.findAll();
  }

  // Served from the backend so the frontend never hardcodes/duplicates the
  // permission catalog — it always reflects what guards actually enforce.
  @Get('permissions-catalog')
  @UseGuards(new PermissionGuard(PERMISSIONS.STAFF_MANAGE))
  catalog() {
    return PERMISSION_CATALOG;
  }

  @Post()
  @UseGuards(new PermissionGuard(PERMISSIONS.ROLES_MANAGE))
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ROLES_MANAGE))
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ROLES_MANAGE))
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}
