type ApiLocation = Pick<Location, "search" | "protocol" | "origin">;
type ApiEnv = { DEV: boolean; VITE_HICT_API?: string };

export function resolveApiBase(location: ApiLocation, env: ApiEnv): string {
  const override = new URLSearchParams(location.search).get("api");
  if (override) {
    try {
      const url = new URL(override);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      // A malformed override leaves the normal default in place.
    }
  }
  if (env.DEV) return env.VITE_HICT_API ?? "http://localhost:5000";
  if (location.protocol === "http:" || location.protocol === "https:") {
    return location.origin;
  }
  return "http://127.0.0.1:8080";
}
