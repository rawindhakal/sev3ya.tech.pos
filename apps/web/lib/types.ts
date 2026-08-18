// Shared domain types mirroring the API responses.

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  printerName?: string | null;
  _count?: { items: number };
}

export interface ModifierGroupRef {
  id: string;
  name: string;
}

export interface Modifier {
  id: string;
  name: string;
  priceCents: number;
  sortOrder: number;
  groupId: string;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  modifiers: Modifier[];
}

export interface ComboComponent {
  id: string;
  quantity: number;
  componentMenuItem: { id: string; name: string; priceCents: number };
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  takeawayPriceCents?: number | null;
  deliveryPriceCents?: number | null;
  station?: PrepStation;
  isAvailable: boolean;
  imageUrl?: string | null;
  printerName?: string | null;
  hsCode?: string | null;
  categoryId: string;
  category?: { id: string; name: string };
  modifierGroups?: ModifierGroupRef[];
  variants?: MenuItemVariant[];
  isCombo?: boolean;
  comboComponents?: ComboComponent[];
}

export interface MenuItemVariant {
  id: string;
  name: string;
  priceCents: number;
  sortOrder: number;
}

// Returns the effective price for a menu item given the order type (#15).
export function priceForType(item: MenuItem, type: OrderType): number {
  if (type === 'TAKEAWAY') return item.takeawayPriceCents ?? item.priceCents;
  if (type === 'DELIVERY') return item.deliveryPriceCents ?? item.priceCents;
  return item.priceCents;
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type OrderStatus =
  | 'OPEN'
  | 'SENT_TO_KITCHEN'
  | 'READY'
  | 'SERVED'
  | 'BILLED'
  | 'PAID'
  | 'REFUNDED'
  | 'CANCELLED';
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
export type PaymentMethod =
  | 'OFFLINE'
  | 'CASH'
  | 'FONEPAY'
  | 'BANK'
  | 'ESEWA'
  | 'KHALTI'
  | 'CARD'
  | 'CREDIT'
  | 'GIFTCARD';

export interface Waiter {
  id: string;
  name: string;
  isActive: boolean;
}

export type RolePortal = 'BACK_OFFICE' | 'WAITER_ONLY';

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  portal: RolePortal;
  isProtected: boolean;
  permissions: string[]; // flat granted permission keys
  employeeCount?: number;
}

export interface Terminal {
  id: string;
  name: string;
  isActive: boolean;
  outletId: string;
}

export interface Outlet {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  isDefault: boolean;
  isActive: boolean;
  terminals?: Terminal[];
  _count?: { orders: number; tables: number };
}

export interface Employee {
  id: string;
  name: string;
  roleId: string;
  role: string;          // display name of the assigned Role (was a fixed StaffRole union)
  portal: RolePortal;
  permissions: string[]; // replaces the old 5 boolean flags
  username?: string | null;
  isActive: boolean;
  clockedIn?: boolean;
  outlets?: { id: string; name: string; isDefault?: boolean }[]; // multi-outlet (Phase 3), resolved at login
  // HRM profile (Phase 4) — all optional
  dateOfBirth?: string | null;
  joinDate?: string | null;
  phone?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  panNumber?: string | null;
  employmentType?: string | null;
  designation?: string | null;
}

export interface RestaurantTable {
  id: string;
  name: string;
  number?: number | null;
  seats: number;
  area?: string | null;
  status: TableStatus;
  isVip?: boolean;
  isActive?: boolean;
  posX?: number | null;
  posY?: number | null;
  activeOrder?: {
    id: string;
    number: number;
    totalCents: number;
    guestCount: number;
    seatedAt?: string | null;
    status: OrderStatus;
  } | null;
  qrToken?: string | null;
}

export interface TableArea {
  area: string;
  tables: RestaurantTable[];
}

export interface CartModifier {
  name: string;
  priceCents: number;
}

export type PrepStation = 'KITCHEN' | 'BAR' | 'BILLING';

export interface OrderItem {
  id: string;
  menuItemId?: string | null;
  nameSnapshot: string;
  unitPriceCents: number;
  hsCodeSnapshot?: string | null;
  quantity: number;
  discountCents?: number;
  modifiers?: CartModifier[] | null;
  notes?: string | null;
  kotStatus: string;
  station?: PrepStation;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  cancelledBy?: string | null;
  printerName?: string | null;
  needsGuestAck?: boolean;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  receivedCents?: number | null;
  giftCardId?: string | null;
  gatewayRef?: string | null;
}

export interface Order {
  id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  tableId?: string | null;
  waiterId?: string | null;
  guestCount: number;
  customerName?: string | null;
  customerPhone?: string | null;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  discountLabel?: string | null;
  discountApprovedBy?: string | null;
  isComplimentary?: boolean;
  cashierName?: string | null;
  reprintCount?: number;
  serviceChargeCents: number;
  packagingChargeCents?: number;
  deliveryChargeCents?: number;
  totalCents: number;
  notes?: string | null;
  voidReason?: string | null;
  refundReason?: string | null;
  refundCents: number;
  refundedAt?: string | null;
  fiscalYear?: string | null;
  fiscalInvoiceNo?: number | null;
  kotNo?: number | null;
  botNo?: number | null;
  items: OrderItem[];
  payments: Payment[];
  table?: { id: string; name: string; area?: string | null; number?: number | null } | null;
  waiter?: { id: string; name: string } | null;
  terminal?: { id: string; name: string } | null;
  createdAt: string;
}

export type ReservationStatus = 'BOOKED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';

export interface Reservation {
  id: string;
  customerName: string;
  phone?: string | null;
  partySize: number;
  reservedAt: string;
  isWaitlist: boolean;
  status: ReservationStatus;
  notes?: string | null;
  tableId?: string | null;
  table?: { id: string; name: string; area?: string | null } | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  loyaltyPoints: number;
  totalSpentCents: number;
  creditBalanceCents?: number;
  visitCount: number;
  lastVisitAt?: string | null;
  optIn: boolean;
  tier: string;
  segment: string;
  orders?: { number: number; type?: string; totalCents: number; paidAt: string; items?: { nameSnapshot: string; quantity: number }[] }[];
}

export interface Features {
  reservations: boolean;
  inventory: boolean;
  purchasing: boolean;
  roastery: boolean;
  modifiers: boolean;
  crm: boolean;
  finance: boolean;
  kds: boolean;
  selfOrder: boolean;
  marketing: boolean;
  hrm: boolean;
}

export interface Settings {
  vatRate: number;
  serviceChargeRate: number;
  pricesIncludeVat?: boolean;
  currencySymbol?: string;
  defaultGuestCount?: number;
  targetTicketMinutes?: number;
  currency: string;
  restaurantName: string;
  features?: Features;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  wifiPassword?: string | null;
  billTemplate?: Record<string, unknown> | null;
  kotTemplate?: Record<string, unknown> | null;
  ird?: { enabled: boolean; username?: string | null; sellerPan?: string | null; apiUrl?: string | null; hasPassword: boolean };
  packagingChargeCents?: number;
  deliveryChargeCents?: number;
  paymentGateways?: {
    esewa: { merchantCode?: string | null; configured: boolean };
    khalti: { publicKey?: string | null; configured: boolean };
    fonepay: { merchantCode?: string | null; configured: boolean };
  };
  sms?: { senderId?: string | null; configured: boolean };
}

export interface Coupon {
  id: string;
  code: string;
  type: 'PCT' | 'RS';
  value: number;
  minOrderCents: number;
  maxUsesTotal?: number | null;
  maxUsesPerCustomer?: number | null;
  usedCount: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface GiftCard {
  id: string;
  code: string;
  initialValueCents: number;
  balanceCents: number;
  isActive: boolean;
  issuedToName?: string | null;
  issuedToPhone?: string | null;
  createdAt: string;
}

export interface GiftCardTransaction {
  id: string;
  giftCardId: string;
  orderId?: string | null;
  amountCents: number;
  note?: string | null;
  createdAt: string;
}

export interface OrderFeedback {
  id: string;
  orderId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  order?: { number: number; type: OrderType };
}

export type WaiterCallStatus = 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED';
export interface WaiterCall {
  id: string;
  tableId: string;
  status: WaiterCallStatus;
  createdAt: string;
  resolvedAt?: string | null;
  table?: { name: string; area?: string | null };
}

export interface CreditLedgerEntry {
  id: string;
  customerId: string;
  type: 'CHARGE' | 'PAYMENT';
  amountCents: number;
  method?: PaymentMethod | null;
  orderId?: string | null;
  note?: string | null;
  balanceAfterCents: number;
  createdBy?: string | null;
  createdAt: string;
}

export interface CashMovement {
  id: string;
  type: 'OPENING' | 'PAY_IN' | 'PAY_OUT';
  amountCents: number;
  reason?: string | null;
  createdAt: string;
}

export interface CashDrawerSession {
  id: string;
  openedAt: string;
  openingFloatCents: number;
  openedBy?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  countedCents?: number | null;
  expectedCents?: number | null;
  varianceCents?: number | null;
  notes?: string | null;
  movements?: CashMovement[];
}

export interface CashDrawerState {
  open: boolean;
  session: CashDrawerSession | null;
  cashSalesCents?: number;
  payIn?: number;
  payOut?: number;
  expectedCents?: number;
}

export interface DashboardData {
  today: { orders: number; earningsCents: number; paidOrders: number; customers: number };
  averages: { dailyEarningCents: number; guestTimeMinutes: number; turnaroundRate: number };
  salesSeries: { date: string; cents: number; orders: number }[];
  paymentsByMethod: { method: PaymentMethod; amountCents: number; count: number }[];
  topItems: { name: string; qty: number; revenueCents: number }[];
  topTables: { name: string; orders: number; revenueCents: number }[];
  waiters: { name: string; orders: number; revenueCents: number; guests: number }[];
  recentOrders: {
    id: string;
    number: number;
    type: OrderType;
    status: OrderStatus;
    totalCents: number;
    guestCount: number;
    table?: string | null;
    waiter?: string | null;
    createdAt: string;
  }[];
  salesByHour: { hour: number; revenueCents: number; orders: number }[];
  ordersByType: { type: OrderType; totalCents: number; count: number }[];
  laborVsSales: { hour: number; laborCents: number; revenueCents: number }[];
  menuPerformance: { name: string; qty: number; revenueCents: number; costCents: number; profitCents: number; marginPct: number }[];
  discountsAndVoidsByDay: { date: string; discountCents: number; complimentaryCount: number; voidCount: number; voidedCents: number }[];
  avgTicketByDay: { date: string; avgMinutes: number | null; tickets: number }[];
  avgTicketTargetMinutes: number;
  salesByCategory: { name: string; revenueCents: number; qty: number }[];
  dowHourHeatmap: { dow: number; hour: number; revenueCents: number; orders: number }[];
  newVsReturningByDay: { date: string; newOrders: number; returningOrders: number }[];
  customerLinkCoverage: { noCustomer: number; total: number };
  paymentMethodsByDay: Record<string, string | number>[];
}

export type JournalStatus = 'POSTED' | 'PENDING_APPROVAL' | 'REJECTED';

export interface JournalApprovalStep {
  id: string;
  ruleId: string;
  stepOrder: number;
  name: string;
  approvalsRequired: number;
}

export interface JournalEntryApproval {
  id: string;
  entryId: string;
  stepOrder: number;
  approvedBy: string;
  note?: string | null;
  createdAt: string;
}

export interface JournalWorkflowRule {
  id: string;
  code: string;
  name: string;
  journalEvent: string;
  minAmountCents?: number | null;
  maxAmountCents?: number | null;
  priority: number;
  postAutomatically: boolean;
  firstReminderHours?: number | null;
  repeatReminderHours?: number | null;
  isActive: boolean;
  steps: JournalApprovalStep[];
  _count?: { entries: number };
}

export interface JournalEntry {
  id: string;
  number: number;
  date: string;
  dateBs?: string;
  type: string;
  narration?: string | null;
  status: JournalStatus;
  source: string;
  sourceId?: string | null;
  workflowRuleId?: string | null;
  currentStep?: number | null;
  amountCents: number;
  lines: { accountId: string; drCents: number; crCents: number; account: { code: string; name: string } }[];
  approvals?: JournalEntryApproval[];
  workflowRule?: JournalWorkflowRule | null;
}

export interface DiscountPreset {
  id: string;
  name: string;
  type: 'PCT' | 'RS';
  value: number; // whole percentage, or Rs cents, per `type`
  isActive: boolean;
  sortOrder: number;
}

// ── HRM (Phase 4) ──────────────────────────────────────
export interface EmployeeDocument {
  id: string;
  employeeId: string;
  employee?: { name: string };
  type: string; // CITIZENSHIP | PASSPORT | PAN | CONTRACT | CERTIFICATE | OTHER
  title: string;
  documentNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  url?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PerformanceNote {
  id: string;
  employeeId: string;
  employee?: { name: string };
  type: string; // NOTE | WARNING | COMMENDATION
  title: string;
  description?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveType {
  id: string;
  name: string;
  isPaid: boolean;
  defaultDaysPerYear: number;
  color?: string | null;
  isActive: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employee?: { name: string };
  leaveTypeId: string;
  leaveType?: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason?: string | null;
  status: LeaveStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectReason?: string | null;
  createdAt: string;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  outletId?: string | null;
  color?: string | null;
  isActive: boolean;
}

export interface RosterEntry {
  id: string;
  employeeId: string;
  employee?: { name: string };
  outletId: string;
  shiftTemplateId?: string | null;
  shiftTemplate?: ShiftTemplate;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
}

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  month: string;
  type: string; // BONUS | DEDUCTION | ADVANCE
  amountCents: number;
  note?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface SalesForecastItem {
  name: string;
  predictedQty: number;
  recentAvgQty: number;
  trend: 'up' | 'down' | 'steady';
}

export interface SalesForecast {
  date: string;
  weekday: string;
  predictedRevenueCents: number;
  predictedOrders: number;
  confidenceLowCents: number;
  confidenceHighCents: number;
  trendFactor: number;
  trendPct: number;
  basis: string;
  sampleSize: number;
  history: { date: string; cents: number; orders: number }[];
  items: SalesForecastItem[];
}
