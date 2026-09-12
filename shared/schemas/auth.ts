import { z } from "zod";

export const signUpSchema = z.object({
  businessName: z.string().trim().min(1, "Le nom de la boutique est requis"),
  fullName: z.string().trim().min(1, "Le nom complet est requis"),
  phone: z.string().trim().min(1, "Le téléphone est requis"),
  email: z.string().trim().email("Email invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().trim().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export type SignInInput = z.infer<typeof signInSchema>;
