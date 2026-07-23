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
  create(@Body() dto: CreateIngredientDto) {
    return this.inventory.createIngredient(dto);
  }
  @Patch('ingredients/:id')
  update(@Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    return this.inventory.updateIngredient(id, dto);
  }
  @Delete('ingredients/:id')
  remove(@Param('id') id: string) {
    return this.inventory.removeIngredient(id);
  }

  @Post('ingredients/:id/movement')
  movement(@Param('id') id: string, @Body() dto: MovementDto) {
    return this.inventory.movement(id, dto);
  }
  @Post('ingredients/:id/stock-take')
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
  setRecipe(@Body() dto: RecipeLineDto) {
    return this.inventory.setRecipeLine(dto);
  }
  @Delete('recipe/:id')
  removeRecipe(@Param('id') id: string) {
    return this.inventory.removeRecipeLine(id);
  }

  // ── Warehouses (multi-location stock) ──────────────
  @Get('warehouses')
  warehouses() {
    return this.inventory.warehouses();
  }
  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventory.createWarehouse(dto);
  }
  @Patch('warehouses/:id')
  updateWarehouse(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.inventory.updateWarehouse(id, dto);
  }
  @Delete('warehouses/:id')
  removeWarehouse(@Param('id') id: string) {
    return this.inventory.removeWarehouse(id);
  }
  @Get('warehouses/:id/stock')
  warehouseStock(@Param('id') id: string) {
    return this.inventory.warehouseStock(id);
  }
  @Post('transfer')
  transfer(@Body() dto: TransferDto) {
    return this.inventory.transfer(dto);
  }
}
