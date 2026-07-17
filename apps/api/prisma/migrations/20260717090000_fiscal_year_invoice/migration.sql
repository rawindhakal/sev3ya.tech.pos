ALTER TABLE "orders" ADD COLUMN "fiscalYear" TEXT;
ALTER TABLE "orders" ADD COLUMN "fiscalInvoiceNo" INTEGER;
CREATE INDEX "orders_fiscalYear_idx" ON "orders"("fiscalYear");
