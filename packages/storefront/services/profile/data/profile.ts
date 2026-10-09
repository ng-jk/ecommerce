import {
  parseDeploymentProfile,
  type DeploymentProfile,
} from "../logic/profile";

export async function loadDeploymentProfile(
  transport: typeof fetch,
  required = false,
): Promise<DeploymentProfile | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await transport("/shop3i-profile.json", {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (
      !required &&
      (response.status === 404 ||
        (response.status === 200 &&
          !response.headers.get("content-type")?.includes("application/json")))
    )
      return null;
    if (
      response.status !== 200 ||
      !response.headers.get("content-type")?.includes("application/json")
    ) {
      throw new Error("Deployment profile unavailable");
    }
    const text = await response.text();
    if (text.length > 8192) throw new Error("Deployment profile too large");
    return parseDeploymentProfile(JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}
