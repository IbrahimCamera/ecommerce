import { z } from "zod";

// Yalidine's docs don't document a length or character-set constraint for
// the API ID / token, so we only enforce non-empty strings here rather than
// guessing a pattern that could reject valid keys.
export const yalidineCredentialsInputSchema = z.object({
  apiId: z.string().trim().min(1, "L'API ID est requis"),
  apiToken: z.string().trim().min(1, "Le token API est requis"),
});

export type YalidineCredentialsInput = z.infer<typeof yalidineCredentialsInputSchema>;
