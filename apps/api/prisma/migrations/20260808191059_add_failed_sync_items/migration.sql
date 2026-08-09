-- CreateTable
CREATE TABLE "failed_sync_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "body" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "errorMessage" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_sync_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "failed_sync_items_idempotencyKey_key" ON "failed_sync_items"("idempotencyKey");

-- CreateIndex
CREATE INDEX "failed_sync_items_createdAt_idx" ON "failed_sync_items"("createdAt");

-- CreateIndex
CREATE INDEX "failed_sync_items_orderId_idx" ON "failed_sync_items"("orderId");

-- CreateIndex
CREATE INDEX "failed_sync_items_acknowledgedAt_idx" ON "failed_sync_items"("acknowledgedAt");
