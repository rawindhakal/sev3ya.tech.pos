import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';

// ZKTeco "ADMS" / Cloud Server push protocol — the device (configured under
// Comm → Cloud Server Setting) makes plain HTTP requests to these endpoints
// itself, over the internet, instead of a LAN puller reaching in. No polling,
// no requirement that any till/server be on the restaurant's network.
//
// The protocol has no real authentication (the device sends only its serial
// number, SN=..., in the query string — confirmed by community ADMS server
// implementations and independent security teardowns). We compensate with an
// allow-list: AttendanceDevice.isActive gates whether a push is stored. An
// unknown serial is auto-registered as INACTIVE (so it shows up in the UI
// for a one-click approve) rather than silently accepted or rejected outright.
//
// Tenant is resolved the same way as every other request — TenantMiddleware
// reads the Host header (the device's "Server Address" is the tenant's own
// subdomain, e.g. cakezake.s3vya.tech) — so no extra plumbing is needed here.
@Injectable()
export class IclockService {
  private readonly log = new Logger('ICLOCK');
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  private async touchDevice(sn: string, data: Prisma.AttendanceDeviceUpdateInput = {}) {
    if (!sn) return null;
    const existing = await this.prisma.attendanceDevice.findUnique({ where: { serial: sn } });
    if (existing) {
      return this.prisma.attendanceDevice.update({ where: { serial: sn }, data: { lastSeenAt: new Date(), ...data } });
    }
    this.log.warn(`Unregistered device SN=${sn} connected — register it under Settings → Attendance → Device to accept its punches`);
    return this.prisma.attendanceDevice.create({
      data: { serial: sn, isActive: false, lastSeenAt: new Date() },
    }).catch(() => null); // race with a concurrent first-seen request — harmless
  }

  // GET /iclock/cdata?SN=...&options=all — device handshake on boot/reconnect.
  // Stamp/OpStamp set high so the device doesn't try to backfill its entire
  // history; ErrorDelay/Delay control its retry cadence.
  async handshake(sn: string): Promise<string> {
    await this.touchDevice(sn);
    return [
      `GET OPTION FROM: ${sn ?? ''}`,
      'Stamp=9999',
      'OpStamp=9999',
      'ErrorDelay=60',
      'Delay=30',
      'TransFlag=1111000000',
      'Realtime=1',
      'Encrypt=0',
    ].join('\r\n');
  }

  // GET /iclock/getrequest?SN=... — heartbeat + "any commands for me?" poll.
  // We never queue device commands, so always answer "nothing to do".
  async heartbeat(sn: string): Promise<string> {
    await this.touchDevice(sn);
    return 'OK';
  }

  // POST /iclock/cdata?SN=...&table=ATTLOG|OPERLOG — the actual data push.
  // ATTLOG body: one punch per line, tab-separated `PIN\tYYYY-MM-DD HH:MM:SS\t...`.
  // Always reply "OK: n" (never an error) so the device marks the batch
  // delivered and doesn't retry-storm — a rejected/unknown device's data is
  // just not stored, logged instead for a human to notice.
  async push(sn: string, table: string | undefined, rawBody: string): Promise<string> {
    const lines = (rawBody ?? '').split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
    const device = await this.prisma.attendanceDevice.findUnique({ where: { serial: sn } });
    if (!device) {
      await this.touchDevice(sn);
      this.log.warn(`Discarded ${lines.length} record(s) from unregistered device SN=${sn}`);
      return `OK: ${lines.length}`;
    }
    if (!device.isActive) {
      await this.touchDevice(sn);
      this.log.warn(`Discarded ${lines.length} record(s) from deactivated device SN=${sn}`);
      return `OK: ${lines.length}`;
    }

    if (table === 'ATTLOG') {
      const punches = lines
        .map((line) => {
          const cols = line.split('\t');
          const deviceUserId = cols[0]?.trim();
          const at = cols[1]?.trim();
          return deviceUserId && at ? { deviceUserId, at } : null;
        })
        .filter((p): p is { deviceUserId: string; at: string } => !!p);
      const result = await this.attendance.ingest(punches);
      await this.touchDevice(sn, {
        lastPushAt: new Date(),
        pushCount: { increment: result.newPunches },
      });
      this.log.log(`SN=${sn}: ${result.newPunches} new punch(es) of ${lines.length} pushed`);
      return `OK: ${result.newPunches}`;
    }

    // OPERLOG (enrollment/user-table changes) and anything else — just
    // acknowledge; we don't sync device-side user/fingerprint records.
    await this.touchDevice(sn);
    return `OK: ${lines.length}`;
  }
}
