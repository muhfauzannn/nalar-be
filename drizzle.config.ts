import { defineConfig } from "drizzle-kit";
import { setDefaultAutoSelectFamily } from "node:net";

// Avoid connection races on dual-stack database hosts where IPv6 is unavailable.
setDefaultAutoSelectFamily(false);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
