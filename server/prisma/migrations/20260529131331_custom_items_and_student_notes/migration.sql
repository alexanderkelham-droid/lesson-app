-- DropForeignKey
ALTER TABLE "lesson_plan_items" DROP CONSTRAINT "lesson_plan_items_sheet_id_fkey";

-- AlterTable
ALTER TABLE "lesson_plan_items" ADD COLUMN     "custom_title" TEXT,
ADD COLUMN     "custom_type" TEXT,
ALTER COLUMN "sheet_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "lesson_plans" ADD COLUMN     "student_notes" TEXT;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
