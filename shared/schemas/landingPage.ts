import { z } from "zod";

// Matches Yalidine's own slug-free URLs — kept simple (lowercase, digits,
// hyphens) since it becomes part of the public order-page URL.
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const landingPageSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3, "Le lien doit contenir au moins 3 caractères")
    .max(80)
    .regex(slugPattern, "Le lien ne peut contenir que des lettres minuscules, chiffres et tirets"),
  title: z.string().trim().min(1, "Le titre est requis").max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  images: z.array(z.string().url()).max(4, "4 images maximum"),
  price: z.number().nonnegative("Le prix doit être positif ou nul"),
  status: z.enum(["draft", "published", "out_of_stock"]),
});

export type LandingPageInput = z.infer<typeof landingPageSchema>;
