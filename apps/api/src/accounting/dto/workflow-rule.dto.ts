import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowStepDto {
  @IsInt() @Min(1) stepOrder: number;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsInt() @Min(1) approvalsRequired?: number;
}

export class CreateWorkflowRuleDto {
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() journalEvent: string;
  @IsOptional() @IsInt() @Min(0) minAmountCents?: number;
  @IsOptional() @IsInt() @Min(0) maxAmountCents?: number;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsBoolean() postAutomatically?: boolean;
  @IsOptional() @IsInt() @Min(0) firstReminderHours?: number;
  @IsOptional() @IsInt() @Min(0) repeatReminderHours?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];
}

// Hand-written (no PartialType/@nestjs/mapped-types dependency in this repo).
export class UpdateWorkflowRuleDto {
  @IsOptional() @IsString() @IsNotEmpty() code?: string;
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() journalEvent?: string;
  @IsOptional() @IsInt() @Min(0) minAmountCents?: number;
  @IsOptional() @IsInt() @Min(0) maxAmountCents?: number;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsBoolean() postAutomatically?: boolean;
  @IsOptional() @IsInt() @Min(0) firstReminderHours?: number;
  @IsOptional() @IsInt() @Min(0) repeatReminderHours?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}
