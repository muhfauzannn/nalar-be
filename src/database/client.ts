import { drizzle } from "drizzle-orm/postgres-js";
import { setDefaultAutoSelectFamily } from "node:net";
import postgres from "postgres";

import { env } from "../config/env";
import * as schema from "./schema";

// Avoid connection races on dual-stack database hosts where IPv6 is unavailable.
setDefaultAutoSelectFamily(false);

const queryClient = postgres(env.databaseUrl);

export const db = drizzle({
  client: queryClient,
  schema,
});
