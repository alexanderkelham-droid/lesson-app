-- CreateEnum
CREATE TYPE "Role" AS ENUM ('student', 'tutor', 'manager');

-- CreateEnum
CREATE TYPE "SheetType" AS ENUM ('worksheet', 'quiz', 'practice');

-- CreateEnum
CREATE TYPE "LessonPlanStatus" AS ENUM ('active', 'completed', 'draft');

-- CreateEnum
CREATE TYPE "LessonPlanItemStatus" AS ENUM ('locked', 'available', 'in_progress', 'completed');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheets" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty_level" INTEGER NOT NULL,
    "content_json" JSONB NOT NULL,
    "sheet_type" "SheetType" NOT NULL,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "tutor_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "status" "LessonPlanStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plan_items" (
    "id" SERIAL NOT NULL,
    "lesson_plan_id" INTEGER NOT NULL,
    "sheet_id" INTEGER NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "scheduled_date" TIMESTAMP(3),
    "status" "LessonPlanItemStatus" NOT NULL DEFAULT 'locked',
    "due_date" TIMESTAMP(3),
    "auto_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_responses" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "sheet_id" INTEGER NOT NULL,
    "lesson_plan_item_id" INTEGER NOT NULL,
    "responses_json" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "completed_at" TIMESTAMP(3),
    "time_spent_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_rules" (
    "id" SERIAL NOT NULL,
    "trigger_condition" TEXT NOT NULL,
    "source_sheet_id" INTEGER NOT NULL,
    "follow_up_sheet_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_logs" (
    "id" SERIAL NOT NULL,
    "lesson_plan_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "trigger_rule_id" INTEGER NOT NULL,
    "source_sheet_id" INTEGER NOT NULL,
    "follow_up_sheet_id" INTEGER NOT NULL,
    "student_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "lesson_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_lesson_plan_item_id_fkey" FOREIGN KEY ("lesson_plan_item_id") REFERENCES "lesson_plan_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_rules" ADD CONSTRAINT "follow_up_rules_source_sheet_id_fkey" FOREIGN KEY ("source_sheet_id") REFERENCES "sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_rules" ADD CONSTRAINT "follow_up_rules_follow_up_sheet_id_fkey" FOREIGN KEY ("follow_up_sheet_id") REFERENCES "sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_logs" ADD CONSTRAINT "follow_up_logs_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "lesson_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_logs" ADD CONSTRAINT "follow_up_logs_trigger_rule_id_fkey" FOREIGN KEY ("trigger_rule_id") REFERENCES "follow_up_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_logs" ADD CONSTRAINT "follow_up_logs_source_sheet_id_fkey" FOREIGN KEY ("source_sheet_id") REFERENCES "sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_logs" ADD CONSTRAINT "follow_up_logs_follow_up_sheet_id_fkey" FOREIGN KEY ("follow_up_sheet_id") REFERENCES "sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
