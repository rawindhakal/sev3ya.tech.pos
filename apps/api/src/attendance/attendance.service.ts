import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatBs } from '../common/bs-date';
import { nepalDateKey, nepalStartOfDate, nepalEndOfDate } from '../common/nepal-time';

// ZKTeco fingerprint attendance + payroll.
//
// Punches arrive exclusively via cloud push (ADMS protocol — see
// IclockService), which calls ingest() below directly. There is no LAN-pull
// path: the API is hosted remotely and has no network route into a
// restaurant, so a device reaching out to us is the only architecture that
// actually works in production.
//
// Payroll: fixed monthly salary pro-rated by present days over a 26-working-day
// month (Nepali standard, Saturdays off), with worked-hours from first-in →
// last-out per day.

const STD_WORKING_DAYS = 26;
const STD_DAY_HOURS = 8;

interface DayCell { firstIn: Date; lastOut: Date; punches: number }

@Injectable()
export class AttendanceService {
  private readonly log = new Logger('Attendance');
  constructor(private readonly prisma: PrismaService) {}

  // Bulk-ingest punches (idempotent — the unique (deviceUserId, at)
  // constraint silently drops already-seen punches). Called by IclockService
  // for every cloud-pushed ATTLOG batch.
  async ingest(punches: { deviceUserId: string; at: string }[]) {
    const employees = await this.prisma.employee.findMany({ where: { deviceUserId: { not: null } } });
    const empByDevice = new Map(employees.map((e) => [String(e.deviceUserId), e.id]));
    let inserted = 0;
    for (const p of punches ?? []) {
      if (!p?.deviceUserId || !p?.at) continue;
      const at = new Date(p.at);
      if (isNaN(at.getTime())) continue;
      try {
        await this.prisma.attendanceLog.create({
          data: {
            deviceUserId: String(p.deviceUserId),
            at,
            employeeId: empByDevice.get(String(p.deviceUserId)) ?? null,
            source: 'DEVICE',
          },
        });
        inserted++;
      } catch { /* duplicate — already ingested */ }
    }
    return { received: punches?.length ?? 0, newPunches: inserted };
  }

  // Manual punch (forgot to scan / device offline).
  async addManual(employeeId: string, at: string, actor?: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw new BadRequestException('Employee not found');
    const log = await this.prisma.attendanceLog.create({
      data: {
        employeeId,
        deviceUserId: emp.deviceUserId ?? `manual-${emp.id.slice(-6)}`,
        at: new Date(at),
        source: 'MANUAL',
      },
    });
    await this.prisma.auditLog.create({
      data: { employeeName: actor ?? 'system', action: 'ATTENDANCE_MANUAL', detail: `${emp.name} @ ${at}` },
    });
    return log;
  }

  // Re-link punches after mapping deviceUserIds to employees.
  async relink() {
    const employees = await this.prisma.employee.findMany({ where: { deviceUserId: { not: null } } });
    let updated = 0;
    for (const e of employees) {
      const r = await this.prisma.attendanceLog.updateMany({
        where: { deviceUserId: String(e.deviceUserId), employeeId: null },
        data: { employeeId: e.id },
      });
      updated += r.count;
    }
    return { relinked: updated };
  }

  // ── Cloud-push (ADMS) device registry ────────────────
  async devices() {
    return this.prisma.attendanceDevice.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async updateDevice(id: string, data: { name?: string; isActive?: boolean }) {
    const device = await this.prisma.attendanceDevice.findUnique({ where: { id } });
    if (!device) throw new BadRequestException('Device not found');
    return this.prisma.attendanceDevice.update({
      where: { id },
      data: { ...(data.name !== undefined ? { name: data.name } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) },
    });
  }

  async deleteDevice(id: string) {
    await this.prisma.attendanceDevice.delete({ where: { id } }).catch(() => null);
    return { ok: true };
  }

  // ── Raw punch log ────────────────────────────────────
  async logs(from?: string, to?: string, employeeId?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 7 * 864e5);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const rows = await this.prisma.attendanceLog.findMany({
      where: { at: { gte: start, lte: end }, ...(employeeId ? { employeeId } : {}) },
      orderBy: { at: 'desc' },
      include: { employee: { select: { name: true, role: true } } },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      dateBs: formatBs(r.at),
      time: r.at.toISOString(),
      deviceUserId: r.deviceUserId,
      employee: r.employee?.name ?? `(unmapped #${r.deviceUserId})`,
      role: r.employee?.role ?? null,
      source: r.source,
    }));
  }

  // ── Per-employee day grid (first-in / last-out / hours) ──
  private async dayGrid(start: Date, end: Date) {
    const logs = await this.prisma.attendanceLog.findMany({
      where: { at: { gte: start, lte: end }, employeeId: { not: null } },
      orderBy: { at: 'asc' },
      include: { employee: { select: { id: true, name: true, role: true, monthlySalaryCents: true } } },
    });
    // employeeId → date → cell
    const grid = new Map<string, { emp: { id: string; name: string; role: string; monthlySalaryCents: number }; days: Map<string, DayCell> }>();
    for (const l of logs) {
      const e = l.employee!;
      const g = grid.get(e.id) ?? { emp: e as any, days: new Map() };
      const day = nepalDateKey(l.at);
      const cell = g.days.get(day);
      if (!cell) g.days.set(day, { firstIn: l.at, lastOut: l.at, punches: 1 });
      else {
        if (l.at < cell.firstIn) cell.firstIn = l.at;
        if (l.at > cell.lastOut) cell.lastOut = l.at;
        cell.punches++;
      }
      grid.set(e.id, g);
    }
    return grid;
  }

  async summary(from?: string, to?: string) {
    const start = from ? nepalStartOfDate(from) : nepalStartOfDate(`${nepalDateKey(new Date()).slice(0, 7)}-01`);
    const end = to ? nepalEndOfDate(to) : new Date();
    const grid = await this.dayGrid(start, end);
    return [...grid.values()].map(({ emp, days }) => {
      const cells = [...days.entries()].sort();
      const hours = cells.reduce((s, [, c]) => s + (c.lastOut.getTime() - c.firstIn.getTime()) / 36e5, 0);
      return {
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        presentDays: days.size,
        totalHours: Math.round(hours * 10) / 10,
        avgHours: days.size ? Math.round((hours / days.size) * 10) / 10 : 0,
        days: cells.map(([date, c]) => ({
          date,
          dateBs: formatBs(new Date(`${date}T12:00:00`)),
          firstIn: c.firstIn,
          lastOut: c.lastOut,
          hours: Math.round(((c.lastOut.getTime() - c.firstIn.getTime()) / 36e5) * 10) / 10,
          punches: c.punches,
        })),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Payroll for a calendar month (YYYY-MM) ───────────
  async payroll(month?: string) {
    const m = month ?? nepalDateKey(new Date()).slice(0, 7);
    const [y, mo] = m.split('-').map(Number);
    const start = nepalStartOfDate(`${m}-01`);
    const nextMonth = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    const end = new Date(nepalStartOfDate(`${nextMonth}-01`).getTime() - 1);
    const grid = await this.dayGrid(start, end);
    const allEmps = await this.prisma.employee.findMany({ where: { isActive: true } });

    const rows = allEmps.map((e) => {
      const g = grid.get(e.id);
      const days = g?.days ?? new Map<string, DayCell>();
      const hours = [...days.values()].reduce((s, c) => s + (c.lastOut.getTime() - c.firstIn.getTime()) / 36e5, 0);
      const presentDays = days.size;
      const expectedHours = presentDays * STD_DAY_HOURS;
      const otHours = Math.max(0, hours - expectedHours);
      const perDay = e.monthlySalaryCents / STD_WORKING_DAYS;
      const grossCents = Math.round(perDay * Math.min(presentDays, STD_WORKING_DAYS));
      return {
        employeeId: e.id,
        name: e.name,
        role: e.role,
        monthlySalaryCents: e.monthlySalaryCents,
        presentDays,
        totalHours: Math.round(hours * 10) / 10,
        otHours: Math.round(otHours * 10) / 10,
        perDayCents: Math.round(perDay),
        grossCents,
      };
    });
    return {
      month: m,
      monthBs: formatBs(start).slice(0, 7),
      basis: `Monthly salary ÷ ${STD_WORKING_DAYS} working days × present days · standard day ${STD_DAY_HOURS}h (OT informational)`,
      rows,
      totals: { grossCents: rows.reduce((s, r) => s + r.grossCents, 0) },
    };
  }
}
