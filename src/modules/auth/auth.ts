import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";

import { env } from "../../config/env";
import { db } from "../../database/client";
import * as schema from "../../database/schema";

export const auth = betterAuth({
  appName: "NALAR",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      prompt: "select_account",
    },
  },
  trustedOrigins: [env.frontendUrl],
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
