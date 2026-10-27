-- Custom SQL migration file, put your code below! --
-- Least privilege for the API role. RLS decides which rows; these grants decide which
-- verbs. No DELETE except sessions (logout), no UPDATE on responses or answers, so a
-- submitted response cannot be changed. INSERT on sessions is deliberately missing:
-- sessions are created only through dev.create_session (0002).
GRANT USAGE ON SCHEMA public TO pulse_app;--> statement-breakpoint
GRANT SELECT ON organisations, users TO pulse_app;--> statement-breakpoint
GRANT SELECT, DELETE ON sessions TO pulse_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON surveys TO pulse_app;--> statement-breakpoint
GRANT SELECT, INSERT ON questions, responses, answers TO pulse_app;
