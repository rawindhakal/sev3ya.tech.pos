import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RolePortal } from '@prisma/client';

export class CreateRoleDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(RolePortal) portal?: RolePortal;
  @IsArray() @IsString({ each: true }) permissionKeys: string[];
}

// Hand-written rather than PartialType-derived — no @nestjs/mapped-types
// dependency in this codebase (matches the existing UpdateOrderDto pattern).
export class UpdateRoleDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(RolePortal) portal?: RolePortal;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionKeys?: string[];
}
