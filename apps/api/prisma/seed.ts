import { PrismaClient, OrderType, PaymentMethod } from '@prisma/client';
import { hashPassword } from '../src/common/password';

const prisma = new PrismaClient();

const VAT_RATE = parseFloat(process.env.VAT_RATE ?? '0.13');
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];

async function main() {
  console.log('🌱 Seeding CakeZake POS…');

  // Clean slate (safe for a dev seed) — children before parents.
  await prisma.auditLog.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.recipeItem.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.cashDrawerSession.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.modifier.deleteMany();
  await prisma.modifierGroup.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.restaurantTable.deleteMany();
  await prisma.waiter.deleteMany();

  // Modifier groups (prices in paisa: 1 NPR = 100 paisa)
  const sizeGroup = await prisma.modifierGroup.create({
    data: {
      name: 'Size',
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 0,
      modifiers: {
        create: [
          { name: 'Regular', priceCents: 0, sortOrder: 0 },
          { name: 'Large', priceCents: 5000, sortOrder: 1 },
        ],
      },
    },
  });

  const milkGroup = await prisma.modifierGroup.create({
    data: {
      name: 'Milk',
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 1,
      modifiers: {
        create: [
          { name: 'Full cream', priceCents: 0, sortOrder: 0 },
          { name: 'Oat milk', priceCents: 6000, sortOrder: 1 },
          { name: 'Soy milk', priceCents: 5000, sortOrder: 2 },
        ],
      },
    },
  });

  const addonsGroup = await prisma.modifierGroup.create({
    data: {
      name: 'Add-ons',
      minSelect: 0,
      maxSelect: 3,
      sortOrder: 2,
      modifiers: {
        create: [
          { name: 'Extra shot', priceCents: 8000, sortOrder: 0 },
          { name: 'Vanilla syrup', priceCents: 4000, sortOrder: 1 },
          { name: 'Whipped cream', priceCents: 5000, sortOrder: 2 },
        ],
      },
    },
  });

  // Categories with items (prices in paisa — e.g. 18000 = Rs 180)
  await prisma.category.create({
    data: {
      name: 'Hot Coffee',
      sortOrder: 0,
      items: {
        create: [
          { name: 'Espresso', description: 'Single shot', priceCents: 12000 },
          { name: 'Cappuccino', description: 'Espresso with steamed milk foam', priceCents: 18000 },
          { name: 'Cafe Latte', description: 'Smooth espresso with milk', priceCents: 19000 },
          { name: 'Americano', description: 'Espresso with hot water', priceCents: 15000 },
        ],
      },
    },
  });

  await prisma.category.create({
    data: {
      name: 'Cold Drinks',
      sortOrder: 1,
      items: {
        create: [
          { name: 'Iced Latte', description: 'Chilled espresso & milk', priceCents: 22000 },
          { name: 'Cold Brew', description: '18-hour steeped', priceCents: 24000 },
          { name: 'Lemon Iced Tea', priceCents: 16000 },
          { name: 'Fresh Lemonade', priceCents: 14000 },
        ],
      },
    },
  });

  await prisma.category.create({
    data: {
      name: 'Bakery',
      sortOrder: 2,
      items: {
        create: [
          { name: 'Butter Croissant', description: 'Flaky, baked fresh', priceCents: 15000 },
          { name: 'Chocolate Muffin', priceCents: 16000 },
          { name: 'Cheesecake Slice', description: 'New York style', priceCents: 28000 },
          { name: 'Chocolate Brownie', priceCents: 18000 },
        ],
      },
    },
  });

  await prisma.category.create({
    data: {
      name: 'Food',
      sortOrder: 3,
      items: {
        create: [
          { name: 'Veg Sandwich', description: 'Grilled, with fries', priceCents: 32000 },
          { name: 'Chicken Burger', description: 'Crispy chicken, brioche bun', priceCents: 45000 },
          { name: 'Margherita Pizza', description: 'Classic tomato & mozzarella', priceCents: 52000 },
        ],
      },
    },
  });

  // Attach modifier groups to coffee/food items so the relation is exercised.
  for (const [name, groups] of [
    ['Cappuccino', [sizeGroup.id, milkGroup.id, addonsGroup.id]],
    ['Cafe Latte', [sizeGroup.id, milkGroup.id, addonsGroup.id]],
    ['Iced Latte', [sizeGroup.id, milkGroup.id]],
    ['Chicken Burger', [addonsGroup.id]],
  ] as [string, string[]][]) {
    const mi = await prisma.menuItem.findFirst({ where: { name } });
    if (mi)
      await prisma.menuItem.update({
        where: { id: mi.id },
        data: { modifierGroups: { connect: groups.map((id) => ({ id })) } },
      });
  }

  // Tables
  await prisma.restaurantTable.createMany({
    data: [
      { name: 'T1', seats: 2, area: 'Ground floor' },
      { name: 'T2', seats: 4, area: 'Ground floor' },
      { name: 'T3', seats: 4, area: 'Ground floor' },
      { name: 'T4', seats: 6, area: 'Ground floor' },
      { name: 'P1', seats: 2, area: 'Patio' },
      { name: 'P2', seats: 4, area: 'Patio' },
    ],
  });

  // Waiters
  await prisma.waiter.createMany({
    data: [
      { name: 'Ava' },
      { name: 'Noah' },
      { name: 'Mia' },
      { name: 'Liam' },
    ],
  });

  // Employees + role permissions (Phase 5). Dev usernames/passwords + quick PINs.
  await prisma.employee.deleteMany();
  await prisma.employee.createMany({
    data: [
      { name: 'Admin', role: 'ADMIN', username: 'admin', passwordHash: hashPassword(process.env.SEED_ADMIN_PASSWORD ?? 'admin123'), pin: '1111', canVoid: true, canDiscount: true, canManageInventory: true, canViewReports: true, canManageStaff: true },
      { name: 'Manager Gita', role: 'MANAGER', username: 'gita', passwordHash: hashPassword(process.env.SEED_MANAGER_PASSWORD ?? 'manager123'), pin: '2222', canVoid: true, canDiscount: true, canManageInventory: true, canViewReports: true },
      { name: 'Cashier Ram', role: 'CASHIER', username: 'ram', passwordHash: hashPassword(process.env.SEED_CASHIER_PASSWORD ?? 'cashier123'), pin: '3333', canDiscount: true },
      { name: 'Barista Sita', role: 'BARISTA', username: 'sita', passwordHash: hashPassword(process.env.SEED_BARISTA_PASSWORD ?? 'barista123'), pin: '4444' },
    ],
  });

  // Prep-station routing: drinks → BAR (BOT), food/bakery → KITCHEN (KOT).
  for (const [catName, station] of [
    ['Hot Coffee', 'BAR'], ['Cold Drinks', 'BAR'], ['Bakery', 'KITCHEN'], ['Food', 'KITCHEN'],
  ] as const) {
    const c = await prisma.category.findFirst({ where: { name: catName } });
    if (c) await prisma.menuItem.updateMany({ where: { categoryId: c.id }, data: { station: station as any } });
  }

  // Ingredients + recipes (Phase 4) — costs in paisa per base unit.
  const beans = await prisma.ingredient.create({
    data: { name: 'Coffee Beans', unit: 'g', stockQty: 5000, reorderLevel: 1000, costPerUnitCents: 200 },
  });
  const milk = await prisma.ingredient.create({
    data: { name: 'Milk', unit: 'ml', stockQty: 20000, reorderLevel: 5000, costPerUnitCents: 10 },
  });
  const sugar = await prisma.ingredient.create({
    data: { name: 'Sugar', unit: 'g', stockQty: 8000, reorderLevel: 2000, costPerUnitCents: 12 },
  });
  const chocolate = await prisma.ingredient.create({
    data: { name: 'Chocolate Syrup', unit: 'ml', stockQty: 3000, reorderLevel: 800, costPerUnitCents: 40 },
  });
  // Suppliers (Phase 5) + assign ingredients to a primary vendor.
  const himalayan = await prisma.supplier.create({
    data: { name: 'Himalayan Coffee Co.', contact: '01-4111222', address: 'Kathmandu', taxId: 'PAN 500111222' },
  });
  const dairyBest = await prisma.supplier.create({
    data: { name: 'DairyBest Supplies', contact: '01-4333444', address: 'Lalitpur' },
  });
  await prisma.ingredient.update({ where: { id: beans.id }, data: { supplierId: himalayan.id } });
  await prisma.ingredient.update({ where: { id: milk.id }, data: { supplierId: dairyBest.id } });
  await prisma.ingredient.update({ where: { id: chocolate.id }, data: { supplierId: dairyBest.id } });

  const recipes: [string, { id: string; qty: number }[]][] = [
    ['Cappuccino', [{ id: beans.id, qty: 18 }, { id: milk.id, qty: 150 }]],
    ['Cafe Latte', [{ id: beans.id, qty: 18 }, { id: milk.id, qty: 200 }]],
    ['Iced Latte', [{ id: beans.id, qty: 18 }, { id: milk.id, qty: 180 }]],
    ['Espresso', [{ id: beans.id, qty: 18 }]],
    ['Americano', [{ id: beans.id, qty: 18 }]],
  ];
  for (const [name, lines] of recipes) {
    const mi = await prisma.menuItem.findFirst({ where: { name } });
    if (!mi) continue;
    for (const l of lines) {
      await prisma.recipeItem.create({
        data: { menuItemId: mi.id, ingredientId: l.id, quantity: l.qty },
      });
    }
  }

  // ── Generate ~30 days of order history so analytics has real data ──
  const allItems = await prisma.menuItem.findMany();
  const allTables = await prisma.restaurantTable.findMany();
  const allWaiters = await prisma.waiter.findMany();
  const methods: PaymentMethod[] = [
    'CASH', 'CASH', 'FONEPAY', 'ESEWA', 'KHALTI', 'CARD', 'BANK', 'CREDIT',
  ];
  const types: OrderType[] = ['DINE_IN', 'DINE_IN', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'];

  // Customer pool (CRM) — takeaway/delivery orders get linked to one.
  const customerPool = await Promise.all(
    [
      ['Rabin Dhakal', '9801000001'],
      ['Anita Sharma', '9801000002'],
      ['Bikash Thapa', '9801000003'],
      ['Puja Karki', '9801000004'],
      ['Suman Gurung', '9801000005'],
      ['Nisha Rai', '9801000006'],
    ].map(([name, phone]) => prisma.customer.create({ data: { name, phone } })),
  );
  const crmStats = new Map<string, { points: number; spent: number; visits: number; last: Date }>();

  let orderCount = 0;
  for (let d = 29; d >= 0; d--) {
    // More orders on recent days + weekends → organic-looking trend.
    const ordersToday = rand(6, 16);
    for (let o = 0; o < ordersToday; o++) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      day.setHours(rand(11, 22), rand(0, 59), 0, 0);

      const type = pick(types);
      const isDineIn = type === 'DINE_IN';
      const table = isDineIn ? pick(allTables) : null;
      const waiter = pick(allWaiters);
      const guestCount = isDineIn ? rand(1, 6) : 1;
      // Takeaway / delivery → attach a customer.
      const customer = isDineIn ? null : pick(customerPool);

      // Build 1–5 line items.
      const lineCount = rand(1, 5);
      const lines = Array.from({ length: lineCount }).map(() => {
        const item = pick(allItems);
        return {
          menuItemId: item.id,
          nameSnapshot: item.name,
          unitPriceCents: item.priceCents,
          quantity: rand(1, 3),
          modifiers: [] as any,
        };
      });
      const subtotal = lines.reduce(
        (s, l) => s + l.unitPriceCents * l.quantity,
        0,
      );
      const tax = Math.round(subtotal * VAT_RATE);
      const total = subtotal + tax;

      // Seated → paid within 30–110 minutes for dine-in.
      const seatedAt = isDineIn ? day : null;
      const paidAt = new Date(day.getTime() + rand(15, 110) * 60_000);

      await prisma.order.create({
        data: {
          type,
          status: 'PAID',
          tableId: table?.id ?? null,
          waiterId: waiter.id,
          guestCount,
          customerId: customer?.id ?? null,
          customerName: customer?.name ?? null,
          customerPhone: customer?.phone ?? null,
          subtotalCents: subtotal,
          taxCents: tax,
          totalCents: total,
          seatedAt,
          billedAt: paidAt,
          paidAt,
          createdAt: day,
          items: { create: lines },
          payments: {
            create: [{ method: pick(methods), amountCents: total, createdAt: paidAt }],
          },
        },
      });
      if (customer) {
        const s = crmStats.get(customer.id) ?? { points: 0, spent: 0, visits: 0, last: paidAt };
        s.points += Math.floor(total / 1000);
        s.spent += total;
        s.visits += 1;
        if (paidAt > s.last) s.last = paidAt;
        crmStats.set(customer.id, s);
      }
      orderCount++;
    }
  }

  // Expenses (Phase: Finance) across the last ~30 days.
  const expenseData: [string, number, string][] = [
    ['RENT', 4500000, 'Monthly shop rent'],
    ['SALARY', 6800000, 'Staff wages'],
    ['UTILITIES', 850000, 'Electricity & water'],
    ['MARKETING', 400000, 'Social media ads'],
    ['MAINTENANCE', 250000, 'Espresso machine service'],
    ['SUPPLIES', 300000, 'Cups, napkins, packaging'],
  ];
  for (const [category, amountCents, description] of expenseData) {
    await prisma.expense.create({
      data: { category: category as any, amountCents, description, incurredAt: new Date(Date.now() - rand(1, 25) * 864e5) },
    });
  }

  // Roll up seeded CRM stats onto each customer.
  for (const [id, s] of crmStats) {
    await prisma.customer.update({
      where: { id },
      data: { loyaltyPoints: s.points, totalSpentCents: s.spent, visitCount: s.visits, lastVisitAt: s.last },
    });
  }

  const counts = {
    categories: await prisma.category.count(),
    items: await prisma.menuItem.count(),
    modifierGroups: await prisma.modifierGroup.count(),
    tables: await prisma.restaurantTable.count(),
    waiters: await prisma.waiter.count(),
    customers: await prisma.customer.count(),
    orders: orderCount,
  };
  console.log('✅ Seed complete:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
