ALTER TABLE "employees" DROP COLUMN "pin";

ALTER TABLE "cafe_settings" ADD COLUMN "irdEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cafe_settings" ADD COLUMN "irdUsername" TEXT;
ALTER TABLE "cafe_settings" ADD COLUMN "irdPassword" TEXT;
ALTER TABLE "cafe_settings" ADD COLUMN "irdSellerPan" TEXT;
ALTER TABLE "cafe_settings" ADD COLUMN "irdApiUrl" TEXT;

ALTER TABLE "orders" ADD COLUMN "irdSyncedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "irdSyncStatus" TEXT;
ALTER TABLE "orders" ADD COLUMN "irdSyncMessage" TEXT;
