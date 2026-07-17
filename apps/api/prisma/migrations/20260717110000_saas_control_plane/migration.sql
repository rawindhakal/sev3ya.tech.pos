CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

CREATE TABLE "plans" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
    "priceMonthlyCents" INTEGER NOT NULL, "priceYearlyCents" INTEGER NOT NULL,
    "maxEmployees" INTEGER NOT NULL DEFAULT 10, "maxItems" INTEGER NOT NULL DEFAULT 200,
    "features" JSONB, "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

CREATE TABLE "tenants" (
    "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "dbName" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL', "planId" TEXT,
    "ownerName" TEXT, "ownerPhone" TEXT, "ownerEmail" TEXT,
    "trialEndsAt" TIMESTAMP(3), "paidUntil" TIMESTAMP(3), "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "tenants_dbName_key" ON "tenants"("dbName");
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "planId" TEXT,
    "amountCents" INTEGER NOT NULL, "method" TEXT NOT NULL, "reference" TEXT,
    "months" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
    "receivedBy" TEXT, "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscription_payments_tenantId_createdAt_idx" ON "subscription_payments"("tenantId", "createdAt");
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
