import type { ConfigContext } from "expo/config";
import { afterEach, expect, it } from "vitest";
import fashionConfig from "../../frontend/fashion/app.config";
import electronicsConfig from "../../frontend/electronics/app.config";

const names = ["SHOP3I_APP_NAME", "SHOP3I_APP_SLUG", "SHOP3I_APP_SCHEME", "SHOP3I_IOS_BUNDLE_ID", "SHOP3I_ANDROID_PACKAGE"] as const;
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const context = { config: { name: "Maison", slug: "portfolio-fashion", ios: { bundleIdentifier: "com.ngjk.portfolio.fashion" }, android: { package: "com.ngjk.portfolio.fashion" } } } as ConfigContext;

afterEach(() => {
  for (const name of names) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

for (const appConfig of [fashionConfig, electronicsConfig]) {
  it("keeps the built-in identity until a complete company profile is supplied", () => {
    for (const name of names) delete process.env[name];
    expect(appConfig(context).name).toBe("Maison");
    expect(() => appConfig({ ...context, config: {} })).toThrow("Base app identity missing");
    process.env.SHOP3I_APP_NAME = "Company One";
    expect(() => appConfig(context)).toThrow("Incomplete or invalid");
  });

  it("selects distinct native identity and rejects malformed identifiers", () => {
    const values: Record<(typeof names)[number], string> = {
      SHOP3I_APP_NAME: "Company One",
      SHOP3I_APP_SLUG: "company-one",
      SHOP3I_APP_SCHEME: "company-one",
      SHOP3I_IOS_BUNDLE_ID: "com.example.companyone",
      SHOP3I_ANDROID_PACKAGE: "com.example.companyone",
    };
    for (const name of names) process.env[name] = values[name];
    const result = appConfig(context);
    expect(result).toMatchObject({ name: "Company One", slug: "company-one", scheme: "company-one",
      ios: { bundleIdentifier: "com.example.companyone" }, android: { package: "com.example.companyone" } });
    const invalid: ReadonlyArray<readonly [(typeof names)[number], string]> = [["SHOP3I_APP_NAME", "X".repeat(81)], ["SHOP3I_APP_SLUG", "Bad"],
      ["SHOP3I_APP_SCHEME", "bad/path"], ["SHOP3I_IOS_BUNDLE_ID", "com..bad"],
      ["SHOP3I_ANDROID_PACKAGE", "bad"]];
    for (const [name, bad] of invalid) {
      const previous = process.env[name];
      process.env[name] = bad;
      expect(() => appConfig(context)).toThrow("Incomplete or invalid");
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  });
}
