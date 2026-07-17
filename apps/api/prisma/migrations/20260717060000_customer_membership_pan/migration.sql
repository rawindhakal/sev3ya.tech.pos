ALTER TABLE "customers" ADD COLUMN "memberCode" TEXT;
ALTER TABLE "customers" ADD COLUMN "panNumber" TEXT;
ALTER TABLE "customers" ADD COLUMN "isBusiness" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "customers_memberCode_key" ON "customers"("memberCode");
