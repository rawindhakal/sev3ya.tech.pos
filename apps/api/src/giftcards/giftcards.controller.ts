import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { GiftCardsService } from './giftcards.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';

class IssueGiftCardDto {
  @IsInt() @Min(1) valueCents: number;
  @IsOptional() @IsString() issuedToName?: string;
  @IsOptional() @IsString() issuedToPhone?: string;
}
class TopUpDto {
  @IsInt() @Min(1) amountCents: number;
  @IsOptional() @IsString() note?: string;
}
class SetActiveDto {
  @IsBoolean() isActive: boolean;
}

@Controller('giftcards')
export class GiftCardsController {
  constructor(private readonly giftCards: GiftCardsService) {}

  @Get()
  list() {
    return this.giftCards.list();
  }

  @Post()
  @UseGuards(new PermissionGuard(PERMISSIONS.GIFTCARDS_MANAGE))
  issue(@Body() dto: IssueGiftCardDto) {
    return this.giftCards.issue(dto);
  }

  // Balance lookup — any signed-in staff (used at checkout to check a card
  // before redeeming it).
  @Get(':code')
  lookup(@Param('code') code: string) {
    return this.giftCards.lookup(code);
  }

  @Get(':code/transactions')
  transactions(@Param('code') code: string) {
    return this.giftCards.transactions(code);
  }

  @Post(':code/topup')
  @UseGuards(new PermissionGuard(PERMISSIONS.GIFTCARDS_MANAGE))
  topUp(@Param('code') code: string, @Body() dto: TopUpDto) {
    return this.giftCards.topUp(code, dto.amountCents, dto.note);
  }

  @Patch(':code/active')
  @UseGuards(new PermissionGuard(PERMISSIONS.GIFTCARDS_MANAGE))
  setActive(@Param('code') code: string, @Body() dto: SetActiveDto) {
    return this.giftCards.setActive(code, dto.isActive);
  }
}
