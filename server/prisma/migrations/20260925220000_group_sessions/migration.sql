-- AlterTable
ALTER TABLE "lesson_sessions" ADD COLUMN     "group_session_id" INTEGER;

-- CreateTable
CREATE TABLE "group_sessions" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "tutor_id" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_mins" INTEGER,
    "location" TEXT,
    "notes" TEXT,
    "series_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_sessions_scheduled_at_idx" ON "group_sessions"("scheduled_at");

-- CreateIndex
CREATE INDEX "group_sessions_tutor_id_idx" ON "group_sessions"("tutor_id");

-- CreateIndex
CREATE INDEX "group_sessions_series_id_idx" ON "group_sessions"("series_id");

-- CreateIndex
CREATE INDEX "lesson_sessions_group_session_id_idx" ON "lesson_sessions"("group_session_id");

-- AddForeignKey
ALTER TABLE "lesson_sessions" ADD CONSTRAINT "lesson_sessions_group_session_id_fkey" FOREIGN KEY ("group_session_id") REFERENCES "group_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

