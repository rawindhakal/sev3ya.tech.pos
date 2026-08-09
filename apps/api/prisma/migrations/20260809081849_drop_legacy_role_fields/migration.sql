-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_roleId_fkey";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "canDiscount",
DROP COLUMN "canManageInventory",
DROP COLUMN "canManageStaff",
DROP COLUMN "canViewReports",
DROP COLUMN "canVoid",
DROP COLUMN "role",
ALTER COLUMN "roleId" SET NOT NULL;

-- DropEnum
DROP TYPE "StaffRole";

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
