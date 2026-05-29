-- AlterTable
ALTER TABLE "lesson_sessions" ADD COLUMN     "active_item_id" INTEGER,
ADD COLUMN     "live_answers" JSONB,
ADD COLUMN     "live_marks" JSONB,
ADD COLUMN     "live_updated_at" TIMESTAMP(3);
