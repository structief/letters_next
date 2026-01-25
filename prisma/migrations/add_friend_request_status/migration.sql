-- AlterTable
ALTER TABLE "Friend" ADD COLUMN "status" TEXT;
ALTER TABLE "Friend" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Update existing records to 'accepted' status
UPDATE "Friend" SET "status" = 'accepted' WHERE "status" IS NULL;
UPDATE "Friend" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;

-- Set NOT NULL constraints after updating existing data
ALTER TABLE "Friend" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "Friend" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "Friend" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Friend" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Friend_friendId_status_idx" ON "Friend"("friendId", "status");
