import { z } from 'zod';

export const roleSchema = z.enum(['manager', 'member']);
export type Role = z.infer<typeof roleSchema>;

export const organisationSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type Organisation = z.infer<typeof organisationSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** `SessionState` signed out: `signedIn` is false and the three principals are null. */
export const signedOutSessionSchema = z.object({
  signedIn: z.literal(false),
  user: z.null(),
  organisation: z.null(),
  role: z.null(),
  devSignIn: z.boolean(),
});
export type SignedOutSession = z.infer<typeof signedOutSessionSchema>;

export const signedInSessionSchema = z.object({
  signedIn: z.literal(true),
  user: sessionUserSchema,
  organisation: organisationSchema,
  role: roleSchema,
  devSignIn: z.boolean(),
});
export type SignedInSession = z.infer<typeof signedInSessionSchema>;

/** `GET /api/me` and `POST /api/dev/sessions`. */
export const sessionStateSchema = z.discriminatedUnion('signedIn', [
  signedOutSessionSchema,
  signedInSessionSchema,
]);
export type SessionState = z.infer<typeof sessionStateSchema>;

/** One row of `GET /api/dev/users`. */
export const devUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
  organisation: organisationSchema,
});
export type DevUser = z.infer<typeof devUserSchema>;

export const devUsersPayloadSchema = z.object({
  users: z.array(devUserSchema),
});
export type DevUsersPayload = z.infer<typeof devUsersPayloadSchema>;

/** `POST /api/dev/sessions` body. */
export const devSessionRequestSchema = z.object({ userId: z.uuid() });
export type DevSessionRequest = z.infer<typeof devSessionRequestSchema>;
