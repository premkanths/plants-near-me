-- Step 3: store the bcrypt hash of the active refresh token so it can be
-- rotated on refresh and invalidated on logout.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "refresh_token_hash" TEXT;
