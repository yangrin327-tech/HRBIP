export function serverConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  // Only deployment-owned environment metadata may supply the public origin; never request Host headers.
  const deploymentHost =
    env.VERCEL_ENV === "production"
      ? env.VERCEL_PROJECT_PRODUCTION_URL
      : env.VERCEL_URL;
  const origin =
    env.APP_ORIGIN ||
    (env.VERCEL && deploymentHost
      ? `https://${deploymentHost}`
      : "http://127.0.0.1:4173");
  const parsed = new URL(origin);
  if (
    parsed.origin !== origin ||
    !["http:", "https:"].includes(parsed.protocol)
  )
    throw new Error(
      "APP_ORIGIN must be a full origin without a path or trailing slash.",
    );
  const publicDemo = env.PUBLIC_DEMO === "true";
  // Authentication is an explicit deployment choice, independent of the
  // portfolio notice. Anonymous samples and exports remain available.
  const guestMode = env.HRBIP_ACCOUNTS_ENABLED !== "true";
  if (
    publicDemo &&
    (parsed.protocol !== "https:" || env.COOKIE_SECURE !== "true")
  )
    throw new Error(
      "Public deployment requires an HTTPS APP_ORIGIN and COOKIE_SECURE=true.",
    );
  if (!guestMode && publicDemo && !env.DATA_DIR && !env.DATABASE_URL)
    throw new Error(
      "Public deployment requires DATABASE_URL or persistent DATA_DIR.",
    );
  if (!guestMode && env.VERCEL && !env.DATABASE_URL)
    throw new Error(
      "Vercel requires DATABASE_URL; its filesystem is not persistent storage.",
    );
  if (env.VERCEL && !publicDemo)
    throw new Error("Vercel deployment requires PUBLIC_DEMO=true.");
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 5
  )
    throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 5.");
  return {
    port,
    host: env.HOST || "127.0.0.1",
    origin,
    publicDemo,
    guestMode,
    trustProxyHops,
  };
}
