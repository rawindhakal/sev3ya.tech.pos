CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");
