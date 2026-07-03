-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_menuItemId_fkey";

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "deliveryPriceCents" INTEGER,
ADD COLUMN     "takeawayPriceCents" INTEGER;

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "menuItemId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "refundCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "voidReason" TEXT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
