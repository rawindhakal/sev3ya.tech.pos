import { IsObject, IsOptional, IsString } from 'class-validator';

// The client's outbox posts here whenever the server genuinely rejects a
// queued write on replay (a real 4xx/5xx, not a connectivity blip) — this is
// an opaque record of what was attempted, not a re-validated request.
export class RecordFailureDto {
  @IsString() method: string;
  @IsString() path: string;
  @IsOptional() @IsObject() body?: Record<string, unknown>;
  @IsString() idempotencyKey: string;
  @IsOptional() @IsString() errorMessage?: string;
}
