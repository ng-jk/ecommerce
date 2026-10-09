export function configuredAssetOrigin(): string {
  return process.env.EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN ?? "";
}
