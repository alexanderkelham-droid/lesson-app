-- AlterTable
ALTER TABLE "lesson_plan_items" ADD COLUMN     "tutor_notes" TEXT;

-- CreateTable
CREATE TABLE "lesson_sessions" (
    "id" SERIAL NOT NULL,
    "lesson_plan_id" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "attended_at" TIMESTAMP(3),
    "duration_mins" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_sessions_scheduled_at_idx" ON "lesson_sessions"("scheduled_at");

-- AddForeignKey
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "lesson_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
