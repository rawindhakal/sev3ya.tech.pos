import { Module } from '@nestjs/common';
import { TerminalsController } from './terminals.controller';

@Module({ controllers: [TerminalsController] })
export class TerminalsModule {}
