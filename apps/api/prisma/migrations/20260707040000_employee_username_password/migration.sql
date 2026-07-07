ALTER TABLE "employees" ADD COLUMN "username" TEXT;
ALTER TABLE "employees" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "employees_username_key" ON "employees"("username");
