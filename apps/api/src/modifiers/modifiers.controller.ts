import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ModifiersService } from './modifiers.service';
import {
  CreateModifierDto,
  CreateModifierGroupDto,
  UpdateModifierDto,
  UpdateModifierGroupDto,
} from './dto/modifier.dto';

// Manages modifier groups and the options inside them.
@Controller('modifier-groups')
export class ModifiersController {
  constructor(private readonly modifiers: ModifiersService) {}

  @Get()
  findAll() {
    return this.modifiers.findAllGroups();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.modifiers.findGroup(id);
  }

  @Post()
  create(@Body() dto: CreateModifierGroupDto) {
    return this.modifiers.createGroup(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateModifierGroupDto) {
    return this.modifiers.updateGroup(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.modifiers.removeGroup(id);
  }

  // ── Nested modifier options ──
  @Post(':groupId/modifiers')
  addModifier(@Param('groupId') groupId: string, @Body() dto: CreateModifierDto) {
    return this.modifiers.addModifier(groupId, dto);
  }

  @Patch('modifiers/:id')
  updateModifier(@Param('id') id: string, @Body() dto: UpdateModifierDto) {
    return this.modifiers.updateModifier(id, dto);
  }

  @Delete('modifiers/:id')
  removeModifier(@Param('id') id: string) {
    return this.modifiers.removeModifier(id);
  }
}
