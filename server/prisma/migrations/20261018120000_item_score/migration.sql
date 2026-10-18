-- Score for custom tasks (paper activity, Corbett, IXL...) that have no sheet to grade
ALTER TABLE "lesson_plan_items" ADD COLUMN "score" DOUBLE PRECISION;
