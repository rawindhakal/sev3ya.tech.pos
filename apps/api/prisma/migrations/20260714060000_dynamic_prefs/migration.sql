ALTER TABLE "cafe_settings" ADD COLUMN "currencySymbol" TEXT NOT NULL DEFAULT 'Rs';
ALTER TABLE "cafe_settings" ADD COLUMN "defaultGuestCount" INTEGER NOT NULL DEFAULT 1;
