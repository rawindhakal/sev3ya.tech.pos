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

// Nepal Standard Time is a fixed UTC+5:45 offset, no DST — safe to hardcode.
const NPT_OFFSET_MIN = 5 * 60 + 45;

// ATTLOG's Status/Verify columns are numeric codes per the ZKTeco PUSH SDK
// spec. Devices/firmware vary on which of these they actually populate — an
// unrecognized code is kept as its raw string rather than dropped, so
// nothing is silently lost even if a specific model uses a code outside
// this common set.
const PUNCH_STATUS: Record<string, string> = {
  '0': 'IN', '1': 'OUT', '2': 'BREAK_OUT', '3': 'BREAK_IN', '4': 'OVERTIME_IN', '5': 'OVERTIME_OUT',
};
const VERIFY_METHOD: Record<string, string> = {
  '0': 'PASSWORD', '1': 'FINGERPRINT', '2': 'CARD', '15': 'FACE',
};

// The device's on-screen clock is set correctly to local (Nepal) time, but
// the ATTLOG wire format has no timezone tag — it's a bare
// "YYYY-MM-DD HH:MM:SS" string. Handing that straight to `new Date(...)` on
// the API server (which runs in UTC on the VPS) makes V8 interpret it as
// already being UTC, silently shifting every punch forward by 5:45h — the
// device's date stays right (it only crosses a day boundary near midnight)
// but the time is wrong, which matches exactly what was reported. Parse the
// components explicitly and build the correct UTC instant instead of
// trusting the platform's ambient-timezone string parsing.
function parseDeviceLocalTime(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - NPT_OFFSET_MIN * 60 * 1000;
  const dt = new Date(utcMs);
  return isNaN(dt.getTime()) ? null : dt;
}

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
  // history. Response fields (confirmed against the ZKTeco PUSH SDK spec,
  // not guessed):
  //  - TransFlag is a 12-char string, one digit per data type the device is
  //    allowed to push (1=on, 0=off): position 1=ATTLOG, 2=OPERLOG,
  //    3=att.photos, 4=new fingerprints, 5=new users, 6=fp images,
  //    7=user-info edits, 8=fp edits, 9=new faces, 10=user photos,
  //    11=work codes, 12=biophotos. We only want attendance + the
  //    enrollment/user-change log (positions 1-2) — leaving the rest off
  //    stops the device wasting bandwidth pushing fingerprint/face binary
  //    data we don't consume.
  //  - Realtime=1 means the device pushes a punch immediately when scanned,
  //    not on a delay — this is what makes ingestion "continuous" rather
  //    than batched.
  //  - Delay/ErrorDelay govern the GET /iclock/getrequest heartbeat cadence
  //    (command poll + liveness), not attendance push latency. Kept short
  //    so a device that drops connection reconnects quickly.
  async handshake(sn: string): Promise<string> {
    await this.touchDevice(sn);
    return [
      `GET OPTION FROM: ${sn ?? ''}`,
      'Stamp=9999',
      'OpStamp=9999',
      'ErrorDelay=30',
      'Delay=5',
      'TransFlag=110000000000',
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
      // Full line: PIN \t Time \t Status \t Verify \t Workcode \t ... — only
      // the first two columns used to be read; Status (in/out/break/OT) and
      // Verify (fingerprint/card/password/face) are real data the device
      // already sends on every line, just discarded until now.
      const punches = lines
        .map((line) => {
          const cols = line.split('\t');
          const deviceUserId = cols[0]?.trim();
          const atRaw = cols[1]?.trim();
          if (!deviceUserId || !atRaw) return null;
          const at = parseDeviceLocalTime(atRaw);
          if (!at) {
            this.log.warn(`SN=${sn}: unparseable punch timestamp "${atRaw}" for user ${deviceUserId} — skipped`);
            return null;
          }
          const statusRaw = cols[2]?.trim();
          const verifyRaw = cols[3]?.trim();
          const workCode = cols[4]?.trim();
          return {
            deviceUserId,
            at: at.toISOString(),
            status: statusRaw ? (PUNCH_STATUS[statusRaw] ?? statusRaw) : undefined,
            verifyMethod: verifyRaw ? (VERIFY_METHOD[verifyRaw] ?? verifyRaw) : undefined,
            workCode: workCode || undefined,
          };
        })
        .filter((p): p is { deviceUserId: string; at: string; status: string | undefined; verifyMethod: string | undefined; workCode: string | undefined } => !!p);
      try {
        const result = await this.attendance.ingest(punches);
        await this.touchDevice(sn, {
          lastPushAt: new Date(),
          pushCount: { increment: result.newPunches },
        });
        this.log.log(`SN=${sn}: ${result.newPunches} new punch(es) of ${lines.length} pushed`);
        return `OK: ${result.newPunches}`;
      } catch (err) {
        // Still reply OK (with 0 accepted) so the device doesn't decide the
        // batch failed and retry-storm — but log loudly since a human needs
        // to notice a batch of real punches silently failed to store.
        this.log.error(`SN=${sn}: failed to ingest ${lines.length} punch(es) — ${(err as Error).message}`);
        return 'OK: 0';
      }
    }

    if (table === 'OPERLOG') {
      // The device's own user-enrollment table, one changed/added user per
      // line — real format is space/tab-separated `KEY=VALUE` pairs prefixed
      // by the literal token "USER", e.g.
      // "USER PIN=7\tName=Ram Bahadur\tPri=0\tCard=1234\tGrp=1\t...". Every
      // other OPERLOG line type (device config changes, admin actions) is
      // acknowledged but not parsed — only user records are useful here.
      let synced = 0;
      for (const line of lines) {
        if (!line.startsWith('USER')) continue;
        const fields = new Map<string, string>();
        for (const m of line.matchAll(/(\w+)=([^\t]*)/g)) fields.set(m[1], m[2].trim());
        const pin = fields.get('PIN');
        if (!pin) continue;
        await this.prisma.deviceEnrolledUser.upsert({
          where: { deviceId_pin: { deviceId: device.id, pin } },
          create: {
            deviceId: device.id, pin,
            name: fields.get('Name') || null,
            card: fields.get('Card') || null,
            privilege: fields.get('Pri') || null,
          },
          update: {
            name: fields.get('Name') || null,
            card: fields.get('Card') || null,
            privilege: fields.get('Pri') || null,
            lastSyncedAt: new Date(),
          },
        });
        synced++;
      }
      if (synced) this.log.log(`SN=${sn}: synced ${synced} device-enrolled user record(s) from OPERLOG`);
      await this.touchDevice(sn);
      return `OK: ${lines.length}`;
    }

    // Anything else — just acknowledge.
    await this.touchDevice(sn);
    return `OK: ${lines.length}`;
  }
}
