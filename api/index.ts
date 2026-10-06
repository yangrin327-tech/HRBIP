import { createApp } from "../server/app";
import { serverConfig } from "../server/config";
import { postgresStore } from "../server/database";

const config = serverConfig();
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for hosted HRBIP.");
export default createApp(postgresStore(process.env.DATABASE_URL), {
  production: true,
  origin: config.origin,
  publicDemo: config.publicDemo,
  trustProxyHops: config.trustProxyHops,
});
