// Shared domain types mirroring the API responses.

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
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
  categoryId: string;
  category?: { id: string; name: string };
  modifierGroups?: ModifierGroupRef[];
  variants?: MenuItemVariant[];
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
  | 'CREDIT';

export interface Waiter {
  id: string;
  name: string;
  isActive: boolean;
}

export type StaffRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'BARISTA' | 'WAITER';

export interface Employee {
  id: string;
  name: string;
  role: StaffRole;
  username?: string | null;
  isActive: boolean;
  canVoid: boolean;
  canDiscount: boolean;
  canManageInventory: boolean;
  canViewReports: boolean;
  canManageStaff: boolean;
  clockedIn?: boolean;
}

export interface RestaurantTable {
  id: string;
  name: string;
  seats: number;
  area?: string | null;
  status: TableStatus;
  isVip?: boolean;
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
  quantity: number;
  discountCents?: number;
  modifiers?: CartModifier[] | null;
  notes?: string | null;
  kotStatus: string;
  station?: PrepStation;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amountCents: number;
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
  serviceChargeCents: number;
  totalCents: number;
  notes?: string | null;
  voidReason?: string | null;
  refundReason?: string | null;
  refundCents: number;
  refundedAt?: string | null;
  items: OrderItem[];
  payments: Payment[];
  table?: { id: string; name: string; area?: string | null } | null;
  waiter?: { id: string; name: string } | null;
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
}

export interface Settings {
  vatRate: number;
  serviceChargeRate: number;
  pricesIncludeVat?: boolean;
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
}
