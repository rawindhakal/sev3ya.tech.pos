-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_outletId_fkey";

-- DropForeignKey
ALTER TABLE "restaurant_tables" DROP CONSTRAINT "restaurant_tables_outletId_fkey";

-- DropForeignKey
ALTER TABLE "terminals" DROP CONSTRAINT "terminals_outletId_fkey";

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "outletId" SET NOT NULL;

-- AlterTable
ALTER TABLE "restaurant_tables" ALTER COLUMN "outletId" SET NOT NULL;

-- AlterTable
ALTER TABLE "terminals" ALTER COLUMN "outletId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
