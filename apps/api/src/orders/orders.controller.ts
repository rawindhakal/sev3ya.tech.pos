import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PermissionGuard, SoftAuthGuard, CurrentEmployee, CurrentOutlet, CurrentTerminal } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';
import { Public } from '../common/public.decorator';
import type { TokenPayload } from '../common/token';
import {
  AttachCustomerDto,
  CancelItemDto,
  ComplimentaryDto,
  CouponDto,
  CreateOrderDto,
  FeedbackDto,
  PayDto,
  RefundDto,
  SaveCartDto,
  UpdateOrderDto,
  VoidDto,
} from './dto/order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  findAll(@Query('status') status?: string, @Query('today') today?: string) {
    return this.orders.findAll({ status, today: today === '1' || today === 'true' });
  }

  // Fired-but-unprinted KOT/BOT items — polled by the desktop auto-printer.
  @Get('kot-queue')
  kotQueue() {
    return this.orders.kotQueue();
  }

  // Running (unsettled) orders for the POS temporary-tables rail.
  @Get('active')
  active() {
    return this.orders.activeOrders();
  }

  @Post('kot-queue/printed')
  markKotPrinted(@Body('itemIds') itemIds: string[]) {
    return this.orders.markKotPrinted(itemIds ?? []);
  }

  // Guest self-orders (QR page) awaiting a waiter/cashier's acknowledgement
  // before they're eligible to print — must stay before @Get(':id').
  @Get('pending-guest-acks')
  pendingGuestAcks() {
    return this.orders.pendingGuestAcks();
  }

  // Must stay before @Get(':id') — otherwise "feedback" would match :id.
  @Get('feedback/summary')
  feedbackSummary(@Query('days') days?: string) {
    return this.orders.feedbackSummary(days ? parseInt(days, 10) : 30);
  }

  // Reachable from the guest self-order tracking page with no staff token —
  // scoped by the order's unguessable cuid rather than by auth.
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Post(':id/reprint')
  recordReprint(@Param('id') id: string) {
    return this.orders.recordReprint(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentOutlet() outletId?: string, @CurrentTerminal() terminalId?: string) {
    return this.orders.create({ ...dto, terminalId: dto.terminalId ?? terminalId }, outletId);
  }

  @Public()
  @Put(':id/cart')
  @UseGuards(SoftAuthGuard)
  saveCart(@Param('id') id: string, @Body() dto: SaveCartDto, @CurrentEmployee() emp: TokenPayload) {
    return this.orders.saveCart(id, dto, emp);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(id, dto);
  }

  @Post(':id/kot')
  kot(@Param('id') id: string) {
    return this.orders.sendKot(id);
  }

  // Waiter/cashier confirms they've seen this guest-submitted order — clears
  // it for printing (see pendingGuestAcks above). Body itemIds is optional;
  // omitted = acknowledge every pending item on the order.
  @Post(':id/acknowledge-guest-items')
  acknowledgeGuestItems(@Param('id') id: string, @Body('itemIds') itemIds?: string[]) {
    return this.orders.acknowledgeGuestItems(id, itemIds);
  }

  @Post(':id/customer')
  attachCustomer(@Param('id') id: string, @Body() dto: AttachCustomerDto) {
    return this.orders.attachCustomer(id, dto);
  }

  // Cancel a single item (prints a cancellation KOT if already fired). Needs
  // the void permission when the item was already sent to the kitchen.
  @Public()
  @Post(':id/items/:itemId/cancel')
  @UseGuards(SoftAuthGuard)
  cancelItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CancelItemDto,
    @CurrentEmployee() emp: TokenPayload,
  ) {
    return this.orders.cancelItem(id, itemId, dto.reason, emp, dto.quantity);
  }

  @Post(':id/bill')
  bill(@Param('id') id: string) {
    return this.orders.bill(id);
  }

  // Mark the whole bill complimentary — needs the manager/admin's own
  // orders.discount-permitted token (same one-off-approval pattern as void/refund).
  @Post(':id/complimentary')
  @UseGuards(new PermissionGuard(PERMISSIONS.ORDERS_DISCOUNT))
  markComplimentary(@Param('id') id: string, @Body() dto: ComplimentaryDto, @CurrentEmployee() emp: TokenPayload) {
    return this.orders.markComplimentary(id, dto.reason, emp);
  }

  @Public()
  @Post(':id/pay')
  @UseGuards(SoftAuthGuard)
  pay(@Param('id') id: string, @Body() dto: PayDto, @CurrentEmployee() emp: TokenPayload) {
    return this.orders.pay(id, dto, emp);
  }

  // Apply/remove a coupon code — reuses the order's discount fields.
  @Post(':id/coupon')
  applyCoupon(@Param('id') id: string, @Body() dto: CouponDto) {
    return this.orders.applyCoupon(id, dto.code);
  }
  @Delete(':id/coupon')
  removeCoupon(@Param('id') id: string) {
    return this.orders.removeCoupon(id);
  }

  // Post-order guest feedback (no auth — reachable from the self-order flow
  // after a bill closes).
  @Public()
  @Post(':id/feedback')
  submitFeedback(@Param('id') id: string, @Body() dto: FeedbackDto) {
    return this.orders.submitFeedback(id, dto.rating, dto.comment);
  }

  @Post(':id/refund')
  @UseGuards(new PermissionGuard(PERMISSIONS.ORDERS_VOID))
  refund(@Param('id') id: string, @Body() dto: RefundDto, @CurrentEmployee() emp: TokenPayload) {
    return this.orders.refund(id, dto, emp);
  }

  @Post(':id/transfer')
  transfer(@Param('id') id: string, @Body('tableId') tableId: string) {
    return this.orders.transfer(id, tableId);
  }

  @Post(':id/merge')
  merge(@Param('id') id: string, @Body('fromOrderId') fromOrderId: string) {
    return this.orders.merge(id, fromOrderId);
  }

  @Public()
  @Post(':id/transfer-items')
  @UseGuards(SoftAuthGuard)
  transferItems(
    @Param('id') id: string,
    @Body() body: { itemIds: string[]; targetTableId: string; quantities?: Record<string, number> },
    @CurrentEmployee() emp: TokenPayload,
  ) {
    return this.orders.transferItems(id, body, emp);
  }

  // Void (with items → needs orders.void) or discard an empty draft (allowed).
  @Public()
  @Delete(':id')
  @UseGuards(SoftAuthGuard)
  cancel(@Param('id') id: string, @Body() body: VoidDto, @CurrentEmployee() emp: TokenPayload) {
    return this.orders.cancel(id, body, emp);
  }
}
