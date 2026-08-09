import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { StockMovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';

class CreateIngredientDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) stockQty?: number;
  @IsOptional() @IsNumber() @Min(0) reorderLevel?: number;
  @IsOptional() @IsInt() @Min(0) costPerUnitCents?: number;
}
class UpdateIngredientDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) reorderLevel?: number;
  @IsOptional() @IsInt() @Min(0) costPerUnitCents?: number;
  @IsOptional() @IsString() supplierId?: string;
}
class MovementDto {
  @IsEnum(StockMovementType) type: StockMovementType;
  @IsNumber() quantity: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() warehouseId?: string;
}
class StockTakeDto {
  @IsNumber() @Min(0) countedQty: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() warehouseId?: string;
}
class RecipeLineDto {
  @IsString() @IsNotEmpty() menuItemId: string;
  @IsString() @IsNotEmpty() ingredientId: string;
  @IsNumber() @Min(0) quantity: number;
}
class CreateWarehouseDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() address?: string;
}
class UpdateWarehouseDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() isActive?: boolean;
}
class TransferDto {
  @IsString() @IsNotEmpty() ingredientId: string;
  @IsString() @IsNotEmpty() fromWarehouseId: string;
  @IsString() @IsNotEmpty() toWarehouseId: string;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsOptional() @IsString() reason?: string;
}

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('ingredients')
  ingredients() {
    return this.inventory.ingredients();
  }
  @Post('ingredients')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  create(@Body() dto: CreateIngredientDto) {
    return this.inventory.createIngredient(dto);
  }
  @Patch('ingredients/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  update(@Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    return this.inventory.updateIngredient(id, dto);
  }
  @Delete('ingredients/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  remove(@Param('id') id: string) {
    return this.inventory.removeIngredient(id);
  }

  @Post('ingredients/:id/movement')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  movement(@Param('id') id: string, @Body() dto: MovementDto) {
    return this.inventory.movement(id, dto);
  }
  @Post('ingredients/:id/stock-take')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  stockTake(@Param('id') id: string, @Body() dto: StockTakeDto) {
    return this.inventory.stockTake(id, dto.countedQty, dto.reason, dto.warehouseId);
  }

  @Get('movements')
  movements(@Query('ingredientId') ingredientId?: string) {
    return this.inventory.movements(ingredientId);
  }
  @Get('valuation')
  valuation() {
    return this.inventory.valuation();
  }

  @Get('recipe/:menuItemId')
  recipe(@Param('menuItemId') menuItemId: string) {
    return this.inventory.recipe(menuItemId);
  }
  @Post('recipe')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  setRecipe(@Body() dto: RecipeLineDto) {
    return this.inventory.setRecipeLine(dto);
  }
  @Delete('recipe/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  removeRecipe(@Param('id') id: string) {
    return this.inventory.removeRecipeLine(id);
  }

  // ── Warehouses (multi-location stock) ──────────────
  @Get('warehouses')
  warehouses() {
    return this.inventory.warehouses();
  }
  @Post('warehouses')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventory.createWarehouse(dto);
  }
  @Patch('warehouses/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  updateWarehouse(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.inventory.updateWarehouse(id, dto);
  }
  @Delete('warehouses/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  removeWarehouse(@Param('id') id: string) {
    return this.inventory.removeWarehouse(id);
  }
  @Get('warehouses/:id/stock')
  warehouseStock(@Param('id') id: string) {
    return this.inventory.warehouseStock(id);
  }
  @Post('transfer')
  @UseGuards(new PermissionGuard(PERMISSIONS.INVENTORY_MANAGE))
  transfer(@Body() dto: TransferDto) {
    return this.inventory.transfer(dto);
  }
}
