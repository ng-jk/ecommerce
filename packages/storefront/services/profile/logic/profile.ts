import { createShopSlug, type ShopSlug } from "@portfolio/api-client";
import { z } from "zod";

const colors = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const branding = z
  .object({
    brand: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    title: z.string().min(1).max(160),
    subtitle: z.string().min(1).max(300),
    accent: colors,
    bg: colors,
    ink: colors,
    hero: colors,
    image: z.string().url().startsWith("https://"),
  })
  .strict();

const profileSchema = z
  .object({
    version: z.literal(1),
    shop: z.string(),
    themeBase: z.enum(["fashion", "electronics"]),
    branding,
    home: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("general") }).strict(),
      z
        .object({
          kind: z.literal("miniapp"),
          installationId: z.number().int().positive(),
        })
        .strict(),
    ]),
  })
  .strict();

export type DeploymentProfile = Omit<z.infer<typeof profileSchema>, "shop"> & {
  shop: ShopSlug;
};

export function parseDeploymentProfile(value: unknown): DeploymentProfile {
  const parsed = profileSchema.parse(value);
  return { ...parsed, shop: createShopSlug(parsed.shop) };
}
