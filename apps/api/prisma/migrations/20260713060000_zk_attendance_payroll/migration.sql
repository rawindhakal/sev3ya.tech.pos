ALTER TABLE "employees" ADD COLUMN "deviceUserId" TEXT;
ALTER TABLE "employees" ADD COLUMN "monthlySalaryCents" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "employees_deviceUserId_key" ON "employees"("deviceUserId");

ALTER TABLE "cafe_settings" ADD COLUMN "zkDeviceIp" TEXT;
ALTER TABLE "cafe_settings" ADD COLUMN "zkDevicePort" INTEGER NOT NULL DEFAULT 4370;

CREATE TABLE "attendance_logs" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "deviceUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DEVICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_logs_deviceUserId_at_key" ON "attendance_logs"("deviceUserId", "at");
CREATE INDEX "attendance_logs_employeeId_at_idx" ON "attendance_logs"("employeeId", "at");
CREATE INDEX "attendance_logs_at_idx" ON "attendance_logs"("at");
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
