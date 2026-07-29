import { Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IclockService } from './iclock.service';
import { Public } from '../common/public.decorator';

// Deliberately NOT under the global /api prefix (see main.ts) — ZKTeco
// device firmware hits a hardcoded /iclock/... path with no way to
// configure a prefix, so these routes have to live at the bare root.
//
// Bodies arrive as plain text (device sends Content-Type: text/plain, not
// JSON), so this controller reads req.body as a raw string (see the
// express.text() middleware registered for this path in main.ts) instead
// of going through Nest's DTO/ValidationPipe pipeline.
//
// Every handler is wrapped in try/catch and always replies with a plain-text
// "OK"-style body even on an unexpected failure (e.g. a DB hiccup). The
// device has no concept of an HTTP error page — an unhandled exception would
// otherwise fall through to Nest's default JSON error response, which the
// device can't parse, so it just retries the same batch forever. Replying OK
// keeps the device's own retry/backoff logic well-behaved; the actual
// failure is logged here for a human to notice instead.
//
// @Public(): ZKTeco firmware has no concept of a bearer token, so this
// controller can't go through staff auth. It's scoped by device serial
// number (SN) instead — see IclockService — which is a weak, spoofable
// credential (attendance data only, not customer PII), an accepted
// tradeoff of the ADMS push protocol rather than something fixable here.
@Public()
@Controller('iclock')
export class IclockController {
  private readonly log = new Logger('ICLOCK');
  constructor(private readonly iclock: IclockService) {}

  @Get('cdata')
  async handshake(@Query('SN') sn: string, @Res() res: Response) {
    try {
      res.type('text/plain').send(await this.iclock.handshake(sn));
    } catch (err) {
      this.log.error(`handshake SN=${sn} failed — ${(err as Error).message}`);
      res.type('text/plain').send('OK');
    }
  }

  @Post('cdata')
  async push(@Query('SN') sn: string, @Query('table') table: string | undefined, @Req() req: Request, @Res() res: Response) {
    try {
      const raw = typeof req.body === 'string' ? req.body : '';
      res.type('text/plain').send(await this.iclock.push(sn, table, raw));
    } catch (err) {
      this.log.error(`push SN=${sn} table=${table} failed — ${(err as Error).message}`);
      res.type('text/plain').send('OK: 0');
    }
  }

  @Get('getrequest')
  async getrequest(@Query('SN') sn: string, @Res() res: Response) {
    try {
      res.type('text/plain').send(await this.iclock.heartbeat(sn));
    } catch (err) {
      this.log.error(`heartbeat SN=${sn} failed — ${(err as Error).message}`);
      res.type('text/plain').send('OK');
    }
  }

  // Device posts the result of a queued command here — we never queue any,
  // but some firmware still pings this; just acknowledge.
  @Post('devicecmd')
  devicecmd(@Res() res: Response) {
    res.type('text/plain').send('OK');
  }
}
