-- AlterTable
ALTER TABLE "lesson_plan_items" ADD COLUMN     "carried_from_id" INTEGER;

-- AddForeignKey
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_carried_from_id_fkey" FOREIGN KEY ("carried_from_id") REFERENCES "lesson_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
