-- AlterTable
ALTER TABLE "cafe_settings" ADD COLUMN     "targetTicketMinutes" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "readyAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "botNo" INTEGER,
ADD COLUMN     "kotNo" INTEGER;
