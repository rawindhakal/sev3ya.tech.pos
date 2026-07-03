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
  isAvailable: boolean;
  imageUrl?: string | null;
  categoryId: string;
  category?: { id: string; name: string };
  modifierGroups?: ModifierGroupRef[];
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

export interface RestaurantTable {
  id: string;
  name: string;
  seats: number;
  area?: string | null;
  status: TableStatus;
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

export interface OrderItem {
  id: string;
  menuItemId?: string | null;
  nameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  modifiers?: CartModifier[] | null;
  notes?: string | null;
  kotStatus: string;
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
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
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

export interface Settings {
  vatRate: number;
  currency: string;
  restaurantName: string;
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
