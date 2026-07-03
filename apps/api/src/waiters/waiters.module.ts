import { Module } from '@nestjs/common';
import { WaitersController } from './waiters.controller';

@Module({ controllers: [WaitersController] })
export class WaitersModule {}
