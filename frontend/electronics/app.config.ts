import type { ConfigContext, ExpoConfig } from "expo/config";

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const name = process.env.SHOP3I_APP_NAME;
  const slug = process.env.SHOP3I_APP_SLUG;
  const scheme = process.env.SHOP3I_APP_SCHEME;
  const ios = process.env.SHOP3I_IOS_BUNDLE_ID;
  const android = process.env.SHOP3I_ANDROID_PACKAGE;
  const values = [name, slug, scheme, ios, android];
  if (!config.name || !config.slug)
    throw new Error("Base app identity missing");
  if (values.every((value) => !value))
    return { ...config, name: config.name, slug: config.slug };
  if (
    values.some((value) => !value) ||
    !name ||
    !slug ||
    !scheme ||
    !ios ||
    !android ||
    name.length > 80 ||
    !/^[a-z][a-z0-9-]{1,62}$/.test(slug) ||
    !/^[a-z][a-z0-9-]{1,62}$/.test(scheme) ||
    !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(ios) ||
    !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(android)
  ) {
    throw new Error("Incomplete or invalid native company identity");
  }
  return {
    ...config,
    name,
    slug,
    scheme,
    ios: { ...config.ios, bundleIdentifier: ios },
    android: { ...config.android, package: android },
  };
}
