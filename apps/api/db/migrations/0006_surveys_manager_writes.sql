-- Split the surveys and questions policies into a read policy for the organisation and
-- write policies that also need the Manager role. Before this, the one `all` policy on each
-- table checked only the organisation, so a Member session could create or change a survey
-- at the database level; only the Manager-only routes stopped it (requirement 4.1.4).
DROP POLICY "questions_org_isolation" ON "questions" CASCADE;--> statement-breakpoint
DROP POLICY "surveys_org_isolation" ON "surveys" CASCADE;--> statement-breakpoint
CREATE POLICY "questions_select_org" ON "questions" AS PERMISSIVE FOR SELECT TO "pulse_app" USING ("questions"."organisation_id" = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "questions_insert_manager" ON "questions" AS PERMISSIVE FOR INSERT TO "pulse_app" WITH CHECK ("questions"."organisation_id" = nullif(current_setting('app.current_org', true), '')::uuid AND current_setting('app.current_role', true) = 'manager');--> statement-breakpoint
CREATE POLICY "surveys_select_org" ON "surveys" AS PERMISSIVE FOR SELECT TO "pulse_app" USING ("surveys"."organisation_id" = nullif(current_setting('app.current_org', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "surveys_insert_manager" ON "surveys" AS PERMISSIVE FOR INSERT TO "pulse_app" WITH CHECK ("surveys"."organisation_id" = nullif(current_setting('app.current_org', true), '')::uuid AND current_setting('app.current_role', true) = 'manager');--> statement-breakpoint
CREATE POLICY "surveys_update_manager" ON "surveys" AS PERMISSIVE FOR UPDATE TO "pulse_app" USING ("surveys"."organisation_id" = nullif(current_setting('app.current_org', true), '')::uuid AND current_setting('app.current_role', true) = 'manager') WITH CHECK ("surveys"."organisation_id" = nullif(current_setting('app.current_org', true), '')::uuid AND current_setting('app.current_role', true) = 'manager');