-- CreateIndex
CREATE INDEX "follow_up_logs_lesson_plan_id_idx" ON "follow_up_logs"("lesson_plan_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_lesson_plan_id_session_id_idx" ON "lesson_plan_items"("lesson_plan_id", "session_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_session_id_idx" ON "lesson_plan_items"("session_id");

-- CreateIndex
CREATE INDEX "lesson_plan_items_carried_from_id_idx" ON "lesson_plan_items"("carried_from_id");

-- CreateIndex
CREATE INDEX "lesson_plans_student_id_idx" ON "lesson_plans"("student_id");

-- CreateIndex
CREATE INDEX "lesson_plans_tutor_id_idx" ON "lesson_plans"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_sessions_lesson_plan_id_scheduled_at_key" ON "lesson_sessions"("lesson_plan_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "student_responses_lesson_plan_item_id_idx" ON "student_responses"("lesson_plan_item_id");

-- CreateIndex
CREATE INDEX "student_responses_student_id_sheet_id_idx" ON "student_responses"("student_id", "sheet_id");

