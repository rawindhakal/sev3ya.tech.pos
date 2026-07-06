-- AlterTable
ALTER TABLE "cafe_settings" ADD COLUMN     "featCrm" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featFinance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featInventory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featKds" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featModifiers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featPurchasing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featReservations" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "featRoastery" BOOLEAN NOT NULL DEFAULT true;
