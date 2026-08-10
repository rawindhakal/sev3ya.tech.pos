-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "printerName" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "printerName" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "needsGuestAck" BOOLEAN NOT NULL DEFAULT false;
