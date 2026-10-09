# Company deployment profile

Mount a reviewed, read-only JSON file at `/etc/shop3i/profile.json` in the
storefront container. Its startup script copies the file to
`/shop3i-profile.json`; Nginx serves that exact endpoint with `Cache-Control:
no-store`. The file is public presentation configuration. Never put tokens,
credentials or private signing material in it.

The strict schema is:

```json
{
  "version": 1,
  "shop": "company-one",
  "themeBase": "fashion",
  "branding": {
    "brand": "Company One",
    "label": "Company One store",
    "title": "A company home",
    "subtitle": "Shop and explore",
    "accent": "#123456",
    "bg": "#ffffff",
    "ink": "#111111",
    "hero": "#eeeeee",
    "image": "https://example.test/hero.jpg"
  },
  "home": { "kind": "miniapp", "installationId": 7 }
}
```

`themeBase` is `fashion` or `electronics`. `home` is either
`{"kind":"general"}` or a Mini App home with a positive merchant installation
ID. The storefront calls the existing Shop scoped Mini App launch endpoint;
approval, enablement, grants and actor permissions are checked by the backend.
A profile cannot grant access. Colors are six-digit hex values, the image URL
must use HTTPS, and the Shop slug is lowercase with 2–63 characters.

The two demo storefronts use their built-in Shop and home when no profile file
is mounted. Set `EXPO_PUBLIC_COMPANY_PROFILE_REQUIRED=true` for a dedicated
company build to reject a missing or invalid profile. Native builds may embed
the same public JSON in `EXPO_PUBLIC_SHOP3I_PROFILE_JSON`. Select native app
name, slug, scheme and bundle identifiers together with `SHOP3I_APP_NAME`,
`SHOP3I_APP_SLUG`, `SHOP3I_APP_SCHEME`, `SHOP3I_IOS_BUNDLE_ID` and
`SHOP3I_ANDROID_PACKAGE` through each Expo `app.config.ts`. Partial or invalid
identity configuration fails the build. The `company` EAS build profile extends
the production build settings; signing credentials are configured in EAS or a
secure build environment. A web runtime profile cannot change an installed
app identity.

The current backend API only provisions `fashion` and `electronics`. A custom
Shop slug is validated by the frontend and included in API requests, but it
requires matching backend merchant provisioning and a compatible API contract
before commerce or Mini App calls will succeed. This profile implements the
shared frontend behavior; it does not provision a merchant or publish a native
app.
