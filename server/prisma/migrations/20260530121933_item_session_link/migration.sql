-- AlterTable
ALTER TABLE "lesson_plan_items" ADD COLUMN     "session_id" INTEGER;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lesson_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
