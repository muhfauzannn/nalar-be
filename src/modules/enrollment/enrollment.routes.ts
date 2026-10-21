import { Hono } from "hono";

import {
  AuthoringRequestError,
  readObject,
} from "../authoring/authoring.shared";
import { requireSession, type AuthVariables } from "../auth/auth.middleware";
import { joinCourseWithCode } from "./enrollment.service";

export const enrollmentRoutes = new Hono<{ Variables: AuthVariables }>();

enrollmentRoutes.use("*", requireSession);

enrollmentRoutes.post("/join", async (context) => {
  const body = await readObject(context.req.raw);
  if (typeof body.code !== "string") {
    throw new AuthoringRequestError("Kode kelas wajib diisi.");
  }
  return context.json(await joinCourseWithCode(context.get("session").user.id, body.code));
});
