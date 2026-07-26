import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IclockService } from './iclock.service';

// Deliberately NOT under the global /api prefix (see main.ts) — ZKTeco
// device firmware hits a hardcoded /iclock/... path with no way to
// configure a prefix, so these routes have to live at the bare root.
//
// Bodies arrive as plain text (device sends Content-Type: text/plain, not
// JSON), so this controller reads req.body as a raw string (see the
// express.text() middleware registered for this path in main.ts) instead
// of going through Nest's DTO/ValidationPipe pipeline.
@Controller('iclock')
export class IclockController {
  constructor(private readonly iclock: IclockService) {}

  @Get('cdata')
  async handshake(@Query('SN') sn: string, @Res() res: Response) {
    const body = await this.iclock.handshake(sn);
    res.type('text/plain').send(body);
  }

  @Post('cdata')
  async push(@Query('SN') sn: string, @Query('table') table: string | undefined, @Req() req: Request, @Res() res: Response) {
    const raw = typeof req.body === 'string' ? req.body : '';
    const body = await this.iclock.push(sn, table, raw);
    res.type('text/plain').send(body);
  }

  @Get('getrequest')
  async getrequest(@Query('SN') sn: string, @Res() res: Response) {
    const body = await this.iclock.heartbeat(sn);
    res.type('text/plain').send(body);
  }

  // Device posts the result of a queued command here — we never queue any,
  // but some firmware still pings this; just acknowledge.
  @Post('devicecmd')
  devicecmd(@Res() res: Response) {
    res.type('text/plain').send('OK');
  }
}
