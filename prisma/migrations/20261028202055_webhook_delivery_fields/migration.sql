/*
  Warnings:

  - You are about to drop the column `attempts` on the `WebhookDelivery` table. All the data in the column will be lost.
  - You are about to drop the column `lastAttemptAt` on the `WebhookDelivery` table. All the data in the column will be lost.
  - You are about to drop the column `responseCode` on the `WebhookDelivery` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `WebhookDelivery` table. All the data in the column will be lost.
  - Added the required column `attemptNumber` to the `WebhookDelivery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `eventType` to the `WebhookDelivery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `success` to the `WebhookDelivery` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "WebhookDelivery_status_idx";

-- AlterTable
ALTER TABLE "WebhookConfig" ADD COLUMN     "triggerOn" "JobStatus"[] DEFAULT ARRAY[]::"JobStatus"[];

-- AlterTable
ALTER TABLE "WebhookDelivery" DROP COLUMN "attempts",
DROP COLUMN "lastAttemptAt",
DROP COLUMN "responseCode",
DROP COLUMN "status",
ADD COLUMN     "attemptNumber" INTEGER NOT NULL,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "eventType" TEXT NOT NULL,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "responseBody" TEXT,
ADD COLUMN     "statusCode" INTEGER,
ADD COLUMN     "success" BOOLEAN NOT NULL;

-- DropEnum
DROP TYPE "DeliveryStatus";

-- CreateIndex
CREATE INDEX "WebhookDelivery_success_nextRetryAt_idx" ON "WebhookDelivery"("success", "nextRetryAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_jobId_idx" ON "WebhookDelivery"("jobId");

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
