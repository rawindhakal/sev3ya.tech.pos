-- CreateTable
CREATE TABLE "green_bean_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT,
    "estate" TEXT,
    "process" TEXT,
    "moisturePct" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "remainingKg" DOUBLE PRECISION NOT NULL,
    "costPerKgCents" INTEGER NOT NULL DEFAULT 0,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "green_bean_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roast_batches" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "greenBatchId" TEXT NOT NULL,
    "greenInputKg" DOUBLE PRECISION NOT NULL,
    "roastedOutputKg" DOUBLE PRECISION NOT NULL,
    "shrinkagePct" DOUBLE PRECISION NOT NULL,
    "chargeTempC" DOUBLE PRECISION,
    "dropTempC" DOUBLE PRECISION,
    "devTimeSec" INTEGER,
    "agtron" INTEGER,
    "notes" TEXT,
    "roastedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roast_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupping_scores" (
    "id" TEXT NOT NULL,
    "greenBatchId" TEXT NOT NULL,
    "aroma" DOUBLE PRECISION NOT NULL,
    "flavor" DOUBLE PRECISION NOT NULL,
    "acidity" DOUBLE PRECISION NOT NULL,
    "body" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cupping_scores_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "roast_batches" ADD CONSTRAINT "roast_batches_greenBatchId_fkey" FOREIGN KEY ("greenBatchId") REFERENCES "green_bean_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupping_scores" ADD CONSTRAINT "cupping_scores_greenBatchId_fkey" FOREIGN KEY ("greenBatchId") REFERENCES "green_bean_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
