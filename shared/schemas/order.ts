import { z } from "zod";
import { normalizeDzPhone } from "../phone.ts";

// "website" is the honeypot: real buyers never see or fill this field (hidden
// via CSS on the public form); a filled value means a bot submitted the form.
// Deliberately NOT constrained to an empty string here — this schema also
// drives client-side form validation, and a bot-filled value (or a stray
// autofill on a legitimate browser) must never surface as a blocking form
// error. The actual honeypot decision (silently drop vs. insert) is made by
// application code in create-order, after parsing succeeds.
export const createOrderSchema = z
  .object({
    landingPageSlug: z.string().trim().min(1),
    firstname: z.string().trim().min(1, "Le prénom est requis").max(100),
    familyname: z.string().trim().min(1, "Le nom est requis").max(100),
    contactPhone: z.string().refine((v) => normalizeDzPhone(v) !== null, {
      message: "Numéro de téléphone invalide (format algérien attendu)",
    }),
    address: z.string().trim().min(1, "L'adresse est requise").max(500),
    toWilayaId: z.number().int().positive(),
    toCommuneId: z.number().int().positive(),
    isStopdesk: z.boolean(),
    stopdeskCenterId: z.number().int().positive().optional(),
    website: z.string().optional().default(""),
  })
  .refine((data) => !data.isStopdesk || data.stopdeskCenterId !== undefined, {
    message: "Sélectionnez un centre stop-desk",
    path: ["stopdeskCenterId"],
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
