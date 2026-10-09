import type { ShopSlug } from "@portfolio/api-client";
import type { DeploymentProfile } from "../../../services/profile";
import { configuredAssetOrigin } from "../data/origin";

export function miniappHome(
  profile: DeploymentProfile | null,
  shop: ShopSlug,
  userId: number | null,
) {
  if (profile?.home.kind !== "miniapp") return null;
  return {
    id: String(profile.home.installationId),
    scope: `${shop}.${userId ?? "guest"}`,
    origin: configuredAssetOrigin(),
  };
}
