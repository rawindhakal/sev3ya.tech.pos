import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  private tableSelect = { table: { select: { id: true, name: true, area: true } } };

  // Bookings for a given day (default today); waitlist is returned separately.
  async findAll(params: { date?: string; status?: string }) {
    const where: Prisma.ReservationWhereInput = { isWaitlist: false };
    if (params.status) where.status = params.status as ReservationStatus;
    if (params.date) {
      const start = new Date(params.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.reservedAt = { gte: start, lt: end };
    }
    return this.prisma.reservation.findMany({
      where,
      orderBy: { reservedAt: 'asc' },
      include: this.tableSelect,
    });
  }

  waitlist() {
    return this.prisma.reservation.findMany({
      where: { isWaitlist: true, status: 'BOOKED' },
      orderBy: { createdAt: 'asc' },
      include: this.tableSelect,
    });
  }

  async create(dto: {
    customerName: string;
    phone?: string;
    partySize?: number;
    reservedAt?: string;
    tableId?: string;
    notes?: string;
    isWaitlist?: boolean;
  }) {
    const reservation = await this.prisma.reservation.create({
      data: {
        customerName: dto.customerName,
        phone: dto.phone,
        partySize: dto.partySize ?? 2,
        reservedAt: dto.reservedAt ? new Date(dto.reservedAt) : new Date(),
        tableId: dto.tableId ?? null,
        notes: dto.notes,
        isWaitlist: dto.isWaitlist ?? false,
      },
      include: this.tableSelect,
    });
    // Hold an assigned table for an advance booking.
    if (!reservation.isWaitlist && reservation.tableId) {
      await this.prisma.restaurantTable.update({
        where: { id: reservation.tableId },
        data: { status: 'RESERVED' },
      });
    }
    return reservation;
  }

  private async get(id: string) {
    const r = await this.prisma.reservation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`Reservation ${id} not found`);
    return r;
  }

  async update(id: string, dto: { tableId?: string; notes?: string; reservedAt?: string; partySize?: number }) {
    await this.get(id);
    return this.prisma.reservation.update({
      where: { id },
      data: {
        tableId: dto.tableId,
        notes: dto.notes,
        partySize: dto.partySize,
        reservedAt: dto.reservedAt ? new Date(dto.reservedAt) : undefined,
      },
      include: this.tableSelect,
    });
  }

  // Seat the guest: mark SEATED and occupy the assigned table if any.
  async seat(id: string) {
    const r = await this.get(id);
    if (r.tableId)
      await this.prisma.restaurantTable.update({
        where: { id: r.tableId },
        data: { status: 'OCCUPIED' },
      });
    return this.prisma.reservation.update({
      where: { id },
      data: { status: 'SEATED' },
      include: this.tableSelect,
    });
  }

  // Cancel / no-show: free a held table.
  async setStatus(id: string, status: 'CANCELLED' | 'NO_SHOW') {
    const r = await this.get(id);
    if (r.tableId)
      await this.prisma.restaurantTable.update({
        where: { id: r.tableId },
        data: { status: 'AVAILABLE' },
      });
    return this.prisma.reservation.update({
      where: { id },
      data: { status },
      include: this.tableSelect,
    });
  }

  remove(id: string) {
    return this.prisma.reservation.delete({ where: { id } });
  }
}
