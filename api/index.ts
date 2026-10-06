import { createApp } from "../server/app.js";
import { serverConfig } from "../server/config.js";
import { postgresStore } from "../server/database.js";
import { noStorage } from "../server/guest.js";

const config = serverConfig();
if (!config.guestMode && !process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for hosted HRBIP.");
export default createApp(
  config.guestMode ? noStorage : postgresStore(process.env.DATABASE_URL!),
  {
    production: true,
    origin: config.origin,
    publicDemo: config.publicDemo,
    guestMode: config.guestMode,
    trustProxyHops: config.trustProxyHops,
  },
);
