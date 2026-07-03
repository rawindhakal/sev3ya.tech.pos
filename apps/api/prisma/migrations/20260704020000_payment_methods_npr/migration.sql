-- AlterEnum: replace PaymentMethod values with Nepal-specific tenders.
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('OFFLINE', 'CASH', 'FONEPAY', 'BANK', 'ESEWA', 'KHALTI', 'CARD', 'CREDIT');
ALTER TABLE "payments" ALTER COLUMN "method" DROP DEFAULT;
-- Map any legacy values to the closest new tender so the cast never fails.
UPDATE "payments" SET "method" = 'CASH'::text::"PaymentMethod" WHERE "method"::text IN ('UPI', 'WALLET', 'OTHER');
ALTER TABLE "payments" ALTER COLUMN "method" TYPE "PaymentMethod_new" USING ("method"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "PaymentMethod_old";
ALTER TABLE "payments" ALTER COLUMN "method" SET DEFAULT 'CASH';
COMMIT;
