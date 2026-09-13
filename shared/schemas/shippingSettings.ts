import { z } from "zod";

// No default numeric values here on purpose: the merchant must provide real
// weight/dimensions, per the project rule against inventing business data.
export const shippingSettingsSchema = z.object({
  fromWilayaId: z.number().int().positive(),
  fromWilayaName: z.string().trim().min(1),
  defaultFreeshipping: z.boolean(),
  defaultIsStopdesk: z.boolean(),
  defaultWeight: z.number().positive(),
  defaultLength: z.number().positive(),
  defaultWidth: z.number().positive(),
  defaultHeight: z.number().positive(),
});

export type ShippingSettingsInput = z.infer<typeof shippingSettingsSchema>;
