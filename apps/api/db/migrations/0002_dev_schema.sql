-- Custom SQL migration file, put your code below! --
-- Dev sign-in support. Both functions are SECURITY DEFINER, so they run as their owner
-- (pulse_owner), and a table owner is exempt from RLS. That is how the picker can list
-- users of every organisation and insert a session row without an INSERT grant.
-- `SET search_path` stops a caller shadowing public tables with a temp or own-schema copy.
-- The grants below are revoked again by 0004: migrations run in every environment, and
-- only dev and test databases get them back (src/db/dev-grants.ts).
CREATE SCHEMA dev;--> statement-breakpoint
CREATE FUNCTION dev.list_users()
RETURNS TABLE (
  user_id uuid,
  user_name text,
  role text,
  organisation_id uuid,
  organisation_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, u.name, u.role, o.id, o.name
  FROM public.users u
  JOIN public.organisations o ON o.id = u.organisation_id
  WHERE u.deactivated_at IS NULL
  ORDER BY o.name, u.name
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION dev.list_users() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION dev.list_users() TO pulse_app;--> statement-breakpoint
CREATE FUNCTION dev.create_session(p_user_id uuid, p_token_hash text, p_expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_active boolean;
BEGIN
  SELECT (u.deactivated_at IS NULL) INTO v_active
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND OR NOT v_active THEN
    RAISE EXCEPTION 'user % does not exist or is deactivated', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.sessions s
  WHERE s.user_id = p_user_id AND s.expires_at <= now();

  INSERT INTO public.sessions (user_id, token_hash, expires_at)
  VALUES (p_user_id, p_token_hash, p_expires_at)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION dev.create_session(uuid, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION dev.create_session(uuid, text, timestamptz) TO pulse_app;--> statement-breakpoint
GRANT USAGE ON SCHEMA dev TO pulse_app;
