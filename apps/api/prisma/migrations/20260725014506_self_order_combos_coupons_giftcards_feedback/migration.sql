-- CreateEnum
CREATE TYPE "WaiterCallStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('STAFF', 'SELF_ORDER');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PCT', 'RS');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'GIFTCARD';

-- AlterTable
ALTER TABLE "cafe_settings" ADD COLUMN     "deliveryChargeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "esewaMerchantCode" TEXT,
ADD COLUMN     "esewaSecretKey" TEXT,
ADD COLUMN     "featSelfOrder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fonepayMerchantCode" TEXT,
ADD COLUMN     "fonepaySecretKey" TEXT,
ADD COLUMN     "khaltiPublicKey" TEXT,
ADD COLUMN     "khaltiSecretKey" TEXT,
ADD COLUMN     "packagingChargeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "smsGatewayApiKey" TEXT,
ADD COLUMN     "smsGatewaySenderId" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "isCombo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryChargeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packagingChargeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'STAFF';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "gatewayRef" TEXT,
ADD COLUMN     "giftCardId" TEXT;

-- AlterTable
ALTER TABLE "restaurant_tables" ADD COLUMN     "qrToken" TEXT;

-- CreateTable
CREATE TABLE "combo_components" (
    "id" TEXT NOT NULL,
    "comboMenuItemId" TEXT NOT NULL,
    "componentMenuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "combo_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiter_calls" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" "WaiterCallStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "waiter_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_feedback" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL DEFAULT 'PCT',
    "value" INTEGER NOT NULL,
    "minOrderCents" INTEGER NOT NULL DEFAULT 0,
    "maxUsesTotal" INTEGER,
    "maxUsesPerCustomer" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialValueCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "issuedToName" TEXT,
    "issuedToPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_card_transactions" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "orderId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "combo_components_comboMenuItemId_idx" ON "combo_components"("comboMenuItemId");

-- CreateIndex
CREATE INDEX "waiter_calls_status_idx" ON "waiter_calls"("status");

-- CreateIndex
CREATE UNIQUE INDEX "order_feedback_orderId_key" ON "order_feedback"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_orderId_key" ON "coupon_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_idx" ON "coupon_redemptions"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_code_key" ON "gift_cards"("code");

-- CreateIndex
CREATE INDEX "gift_card_transactions_giftCardId_idx" ON "gift_card_transactions"("giftCardId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_qrToken_key" ON "restaurant_tables"("qrToken");

-- AddForeignKey
ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_comboMenuItemId_fkey" FOREIGN KEY ("comboMenuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_componentMenuItemId_fkey" FOREIGN KEY ("componentMenuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_feedback" ADD CONSTRAINT "order_feedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

