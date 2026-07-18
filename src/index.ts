import app from "./app";
import { env } from "./config/env";

export default {
  port: env.port,
  fetch: app.fetch,
};
