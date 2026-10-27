CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"response_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"rating_value" smallint,
	"yes_no_value" boolean,
	CONSTRAINT "answers_response_id_question_id_unique" UNIQUE("response_id","question_id"),
	CONSTRAINT "answers_one_value_check" CHECK (num_nonnulls("answers"."rating_value", "answers"."yes_no_value") = 1),
	CONSTRAINT "answers_rating_value_check" CHECK ("answers"."rating_value" IS NULL OR "answers"."rating_value" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "organisations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	CONSTRAINT "questions_survey_id_id_unique" UNIQUE("survey_id","id"),
	CONSTRAINT "questions_survey_id_position_unique" UNIQUE("survey_id","position"),
	CONSTRAINT "questions_position_check" CHECK ("questions"."position" BETWEEN 1 AND 3),
	CONSTRAINT "questions_type_check" CHECK ("questions"."type" IN ('rating', 'yes_no'))
);
--> statement-breakpoint
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "responses_survey_id_id_unique" UNIQUE("survey_id","id"),
	CONSTRAINT "responses_survey_id_user_id_week_start_unique" UNIQUE("survey_id","user_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_expires_at_check" CHECK ("sessions"."expires_at" > "sessions"."created_at"),
	CONSTRAINT "sessions_token_hash_check" CHECK ("sessions"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_organisation_id_id_unique" UNIQUE("organisation_id","id"),
	CONSTRAINT "surveys_status_check" CHECK ("surveys"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "surveys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_organisation_id_id_unique" UNIQUE("organisation_id","id"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('manager', 'member')),
	CONSTRAINT "users_deactivated_at_check" CHECK ("users"."deactivated_at" IS NULL OR "users"."deactivated_at" >= "users"."joined_at"),
	CONSTRAINT "users_joined_at_check" CHECK ("users"."joined_at" <= "users"."created_at")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_survey_id_question_id_questions_survey_id_id_fk" FOREIGN KEY ("survey_id","question_id") REFERENCES "public"."questions"("survey_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_survey_id_response_id_responses_survey_id_id_fk" FOREIGN KEY ("survey_id","response_id") REFERENCES "public"."responses"("survey_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_organisation_id_survey_id_surveys_organisation_id_id_fk" FOREIGN KEY ("organisation_id","survey_id") REFERENCES "public"."surveys"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_organisation_id_survey_id_surveys_organisation_id_id_fk" FOREIGN KEY ("organisation_id","survey_id") REFERENCES "public"."surveys"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_organisation_id_user_id_users_organisation_id_id_fk" FOREIGN KEY ("organisation_id","user_id") REFERENCES "public"."users"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_response_idx" ON "answers" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "responses_org_week_idx" ON "responses" USING btree ("organisation_id","week_start");--> statement-breakpoint
CREATE INDEX "responses_survey_week_idx" ON "responses" USING btree ("survey_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_one_active_per_org" ON "surveys" USING btree ("organisation_id") WHERE "surveys"."status" = 'active';--> statement-breakpoint
CREATE INDEX "users_organisation_idx" ON "users" USING btree ("organisation_id");--> statement-breakpoint
CREATE POLICY "answers_org_isolation" ON "answers" AS PERMISSIVE FOR ALL TO "pulse_app" USING (EXISTS (SELECT 1 FROM responses r WHERE r.id = "answers"."response_id" AND r.organisation_id = current_setting('app.current_org', true)::uuid AND (current_setting('app.current_role', true) = 'manager' OR r.user_id = current_setting('app.current_user', true)::uuid))) WITH CHECK (EXISTS (SELECT 1 FROM responses r WHERE r.id = "answers"."response_id" AND r.organisation_id = current_setting('app.current_org', true)::uuid AND (current_setting('app.current_role', true) = 'manager' OR r.user_id = current_setting('app.current_user', true)::uuid)));--> statement-breakpoint
CREATE POLICY "organisations_select_own" ON "organisations" AS PERMISSIVE FOR SELECT TO "pulse_app" USING ("organisations"."id" = current_setting('app.current_org', true)::uuid);--> statement-breakpoint
CREATE POLICY "questions_org_isolation" ON "questions" AS PERMISSIVE FOR ALL TO "pulse_app" USING ("questions"."organisation_id" = current_setting('app.current_org', true)::uuid) WITH CHECK ("questions"."organisation_id" = current_setting('app.current_org', true)::uuid);--> statement-breakpoint
CREATE POLICY "responses_org_isolation" ON "responses" AS PERMISSIVE FOR ALL TO "pulse_app" USING ("responses"."organisation_id" = current_setting('app.current_org', true)::uuid AND (current_setting('app.current_role', true) = 'manager' OR "responses"."user_id" = current_setting('app.current_user', true)::uuid)) WITH CHECK ("responses"."organisation_id" = current_setting('app.current_org', true)::uuid AND (current_setting('app.current_role', true) = 'manager' OR "responses"."user_id" = current_setting('app.current_user', true)::uuid));--> statement-breakpoint
CREATE POLICY "sessions_select_own_token" ON "sessions" AS PERMISSIVE FOR SELECT TO "pulse_app" USING ("sessions"."token_hash" = current_setting('app.current_session_token', true));--> statement-breakpoint
CREATE POLICY "sessions_delete_own_token" ON "sessions" AS PERMISSIVE FOR DELETE TO "pulse_app" USING ("sessions"."token_hash" = current_setting('app.current_session_token', true));--> statement-breakpoint
CREATE POLICY "surveys_org_isolation" ON "surveys" AS PERMISSIVE FOR ALL TO "pulse_app" USING ("surveys"."organisation_id" = current_setting('app.current_org', true)::uuid) WITH CHECK ("surveys"."organisation_id" = current_setting('app.current_org', true)::uuid);--> statement-breakpoint
CREATE POLICY "users_select_self_or_org" ON "users" AS PERMISSIVE FOR SELECT TO "pulse_app" USING ("users"."organisation_id" = current_setting('app.current_org', true)::uuid OR "users"."id" = current_setting('app.current_user', true)::uuid);