-- DropIndex
DROP INDEX "student_lesson_days_student_id_day_of_week_key";

-- AlterTable
ALTER TABLE "lesson_sessions" ADD COLUMN     "slot_id" INTEGER,
ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "student_lesson_days" ADD COLUMN     "duration_mins" INTEGER,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "time" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ixl_username" TEXT,
ADD COLUMN     "school_year" TEXT;

-- CreateIndex
CREATE INDEX "lesson_sessions_slot_id_idx" ON "lesson_sessions"("slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_lesson_days_student_id_day_of_week_time_key" ON "student_lesson_days"("student_id", "day_of_week", "time");

-- AddForeignKey
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "student_lesson_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

