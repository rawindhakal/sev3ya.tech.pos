-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PCT', 'RS');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cancelledBy" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discountLabel" TEXT,
ADD COLUMN     "isComplimentary" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "discount_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL DEFAULT 'PCT',
    "value" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_presets_pkey" PRIMARY KEY ("id")
);
