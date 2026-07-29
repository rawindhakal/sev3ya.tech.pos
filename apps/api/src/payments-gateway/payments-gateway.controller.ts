import { Body, Controller, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaymentsGatewayService } from './payments-gateway.service';
import { Public } from '../common/public.decorator';

class InitiateDto {
  @IsString() @IsNotEmpty() orderId: string;
  @IsString() @IsNotEmpty() returnUrl: string;
  @IsOptional() @IsString() websiteUrl?: string;
  @IsOptional() @IsString() failureUrl?: string;
}
class VerifyEsewaDto {
  @IsString() @IsNotEmpty() orderId: string;
  @IsString() @IsNotEmpty() data: string;
}
class VerifyKhaltiDto {
  @IsString() @IsNotEmpty() orderId: string;
  @IsString() @IsNotEmpty() pidx: string;
}
class VerifyFonepayDto {
  @IsString() @IsNotEmpty() orderId: string;
  @IsString() @IsNotEmpty() prn: string;
}

// Reached from guest-facing checkout (self-order pay page) as well as the
// POS — can't require a staff token. Safety instead comes from: orderId
// being an unguessable cuid, orders.pay() being idempotent per-order, and
// gateway callback dedup (see payments-gateway.service.ts).
@Public()
@Controller('payments-gateway')
export class PaymentsGatewayController {
  constructor(private readonly gateway: PaymentsGatewayService) {}

  @Post('esewa/initiate')
  initiateEsewa(@Body() dto: InitiateDto) {
    return this.gateway.initiateEsewa(dto.orderId, dto.returnUrl, dto.failureUrl ?? dto.returnUrl);
  }
  @Post('esewa/verify')
  verifyEsewa(@Body() dto: VerifyEsewaDto) {
    return this.gateway.verifyEsewa(dto.orderId, dto.data);
  }

  @Post('khalti/initiate')
  initiateKhalti(@Body() dto: InitiateDto) {
    return this.gateway.initiateKhalti(dto.orderId, dto.returnUrl, dto.websiteUrl ?? dto.returnUrl);
  }
  @Post('khalti/verify')
  verifyKhalti(@Body() dto: VerifyKhaltiDto) {
    return this.gateway.verifyKhalti(dto.orderId, dto.pidx);
  }

  @Post('fonepay/initiate')
  initiateFonepay(@Body() dto: InitiateDto) {
    return this.gateway.initiateFonepay(dto.orderId, dto.returnUrl);
  }
  @Post('fonepay/verify')
  verifyFonepay(@Body() dto: VerifyFonepayDto) {
    return this.gateway.verifyFonepay(dto.orderId, dto.prn);
  }
}
