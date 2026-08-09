-- AlterTable
ALTER TABLE "attendance_devices" ADD COLUMN     "outletId" TEXT;

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "outletId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "outletId" TEXT;

-- AlterTable
ALTER TABLE "restaurant_tables" ADD COLUMN     "outletId" TEXT;

-- AlterTable
ALTER TABLE "terminals" ADD COLUMN     "outletId" TEXT;

-- CreateTable
CREATE TABLE "outlets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "taxId" TEXT,
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_outlets" (
    "employeeId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,

    CONSTRAINT "employee_outlets_pkey" PRIMARY KEY ("employeeId","outletId")
);

-- CreateIndex
CREATE INDEX "terminals_outletId_idx" ON "terminals"("outletId");

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_outlets" ADD CONSTRAINT "employee_outlets_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_outlets" ADD CONSTRAINT "employee_outlets_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
