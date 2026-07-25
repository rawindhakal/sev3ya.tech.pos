import { Module } from '@nestjs/common';
import { GiftCardsService } from './giftcards.service';
import { GiftCardsController } from './giftcards.controller';

@Module({
  controllers: [GiftCardsController],
  providers: [GiftCardsService],
  exports: [GiftCardsService],
})
export class GiftCardsModule {}
