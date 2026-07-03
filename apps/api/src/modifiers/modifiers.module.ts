import { Module } from '@nestjs/common';
import { ModifiersService } from './modifiers.service';
import { ModifiersController } from './modifiers.controller';

@Module({
  controllers: [ModifiersController],
  providers: [ModifiersService],
})
export class ModifiersModule {}
