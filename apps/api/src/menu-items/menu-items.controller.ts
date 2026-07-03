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
import { MenuItemsService } from './menu-items.service';
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/menu-item.dto';

@Controller('menu-items')
export class MenuItemsController {
  constructor(private readonly items: MenuItemsService) {}

  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.items.findAll(categoryId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.items.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMenuItemDto) {
    return this.items.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.items.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.items.remove(id);
  }
}
