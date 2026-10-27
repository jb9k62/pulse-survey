import { z } from 'zod';

/** Every error body, contract section 2.5. */
export const errorBodySchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.array(z.string()),
  path: z.string(),
  timestamp: z.string(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
