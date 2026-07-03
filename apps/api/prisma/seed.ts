import { PrismaClient, OrderType, PaymentMethod } from '@prisma/client';

const prisma = new PrismaClient();

const VAT_RATE = parseFloat(process.env.VAT_RATE ?? '0.13');
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];

async function main() {
  console.log('🌱 Seeding CakeZake POS…');

  // Clean slate (safe for a dev seed).
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.modifier.deleteMany();
  await prisma.modifierGroup.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.restaurantTable.deleteMany();
  await prisma.waiter.deleteMany();

  // Modifier groups
  const sizeGroup = await prisma.modifierGroup.create({
    data: {
      name: 'Size',
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 0,
      modifiers: {
        create: [
          { name: 'Regular', priceCents: 0, sortOrder: 0 },
          { name: 'Large', priceCents: 150, sortOrder: 1 },
        ],
      },
    },
  });

  const addonsGroup = await prisma.modifierGroup.create({
    data: {
      name: 'Add-ons',
      minSelect: 0,
      maxSelect: 3,
      sortOrder: 1,
      modifiers: {
        create: [
          { name: 'Extra cheese', priceCents: 100, sortOrder: 0 },
          { name: 'Extra sauce', priceCents: 50, sortOrder: 1 },
          { name: 'Bacon', priceCents: 200, sortOrder: 2 },
        ],
      },
    },
  });

  // Categories with items
  const starters = await prisma.category.create({
    data: {
      name: 'Starters',
      sortOrder: 0,
      items: {
        create: [
          { name: 'Garlic Bread', description: 'Toasted with herb butter', priceCents: 550 },
          { name: 'Chicken Wings', description: '6 pcs, spicy glaze', priceCents: 899 },
          { name: 'Loaded Fries', description: 'Cheese & jalapeños', priceCents: 699 },
        ],
      },
    },
  });

  const mains = await prisma.category.create({
    data: {
      name: 'Mains',
      sortOrder: 1,
      items: {
        create: [
          { name: 'Margherita Pizza', description: 'Classic tomato & mozzarella', priceCents: 1299 },
          { name: 'Beef Burger', description: 'Angus patty, brioche bun', priceCents: 1450 },
          { name: 'Grilled Salmon', description: 'With seasonal veg', priceCents: 1899 },
        ],
      },
    },
  });

  const drinks = await prisma.category.create({
    data: {
      name: 'Drinks',
      sortOrder: 2,
      items: {
        create: [
          { name: 'Fresh Lemonade', priceCents: 399 },
          { name: 'Iced Coffee', priceCents: 450 },
          { name: 'Sparkling Water', priceCents: 250 },
        ],
      },
    },
  });

  const desserts = await prisma.category.create({
    data: {
      name: 'Desserts',
      sortOrder: 3,
      items: {
        create: [
          { name: 'Chocolate Cake', description: 'Warm, with ganache', priceCents: 650 },
          { name: 'Cheesecake', description: 'New York style', priceCents: 700 },
        ],
      },
    },
  });

  // Attach modifier groups to a couple of items so the relation is exercised.
  const burger = await prisma.menuItem.findFirst({ where: { name: 'Beef Burger' } });
  if (burger) {
    await prisma.menuItem.update({
      where: { id: burger.id },
      data: { modifierGroups: { connect: [{ id: sizeGroup.id }, { id: addonsGroup.id }] } },
    });
  }
  const pizza = await prisma.menuItem.findFirst({ where: { name: 'Margherita Pizza' } });
  if (pizza) {
    await prisma.menuItem.update({
      where: { id: pizza.id },
      data: { modifierGroups: { connect: [{ id: sizeGroup.id }] } },
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

  // ── Generate ~30 days of order history so analytics has real data ──
  const allItems = await prisma.menuItem.findMany();
  const allTables = await prisma.restaurantTable.findMany();
  const allWaiters = await prisma.waiter.findMany();
  const methods: PaymentMethod[] = ['CASH', 'CARD', 'UPI', 'WALLET'];
  const types: OrderType[] = ['DINE_IN', 'DINE_IN', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'];

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
      orderCount++;
    }
  }

  const counts = {
    categories: await prisma.category.count(),
    items: await prisma.menuItem.count(),
    modifierGroups: await prisma.modifierGroup.count(),
    tables: await prisma.restaurantTable.count(),
    waiters: await prisma.waiter.count(),
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
