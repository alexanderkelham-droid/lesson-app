-- CreateEnum
CREATE TYPE "SubjectFocus" AS ENUM ('maths', 'english', 'both');

-- AlterTable
ALTER TABLE "lesson_plans" ADD COLUMN     "lesson_day_of_week" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "subject_focus" "SubjectFocus";

-- CreateTable
CREATE TABLE "student_lesson_days" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "day_of_week" INTEGER NOT NULL,

    CONSTRAINT "student_lesson_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_lesson_days_student_id_day_of_week_key" ON "student_lesson_days"("student_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "student_lesson_days" ADD CONSTRAINT "student_lesson_days_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
