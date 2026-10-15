import { z } from "zod";

export const platformIdentity = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: z.string().email(),
  account_status: z.string(),
});
export const authenticatedIdentity = z.object({
  user: platformIdentity,
  token: z.string().min(1),
});
export const identityResult = z.object({ user: platformIdentity });
export const logoutResult = z.object({ logged_out: z.literal(true) });
export const loginInput = z
  .object({
    email: z.string().trim().email().max(255),
    password: z.string().min(1),
    device_name: z.string().trim().min(1).max(100),
  })
  .strict();
export const registerInput = loginInput
  .extend({
    name: z.string().trim().min(1).max(100),
    password: z.string().min(10),
    password_confirmation: z.string().min(10),
  })
  .refine((input) => input.password === input.password_confirmation, {
    path: ["password_confirmation"],
    message: "Passwords must match.",
  });
