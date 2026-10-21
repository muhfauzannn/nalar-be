import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";

import { fileResponse } from "../../lib/file-response";
import { formatBytes, MAX_PDF_BYTES } from "../../lib/pdf-upload";
import { requireSession, type AuthVariables } from "../auth/auth.middleware";
import { readForm, readObject, uuid } from "./authoring.shared";
import {
  parseAssignmentPatch,
  parseCoursePatch,
  parseCriteria,
  parseLessonPatch,
  parseModulePatch,
  parseNewAssignment,
  parseNewCourse,
  parseNewLesson,
  parseNewModule,
  parseNewQuiz,
  parseOrder,
  parseQuestion,
  parseQuizPatch,
  parseResource,
  parseResourceEdit,
  parseResourceUpload,
} from "./authoring.parsers";
import {
  copyMyAssignment,
  createMyAssignment,
  getMyAssignment,
  setMyCriteria,
  updateMyAssignment,
} from "./assignment.service";
import {
  addLesson,
  addModule,
  addResource,
  addResourceFile,
  createCourse,
  disableJoinCode,
  editLesson,
  editModule,
  editResource,
  getMyCourse,
  getMyLesson,
  getMyResourceFile,
  listAuthoringScenarios,
  listAuthoringSubjects,
  listMyCourses,
  orderLessons,
  orderModules,
  orderResources,
  regenerateJoinCode,
  removeResource,
  replaceResourceUpload,
  updateMyCourse,
} from "./course.service";
import {
  addQuestion,
  copyMyQuiz,
  createMyQuiz,
  editQuestion,
  getMyQuiz,
  orderQuestions,
  removeQuestion,
  updateMyQuiz,
} from "./quiz.service";

type Ctx = Context<{ Variables: AuthVariables }>;

// Authoring is per-course, not per-account-type: any signed-in user may call
// these, and every service re-checks "active teacher of the course that owns
// this id" before touching anything.
export const authoringRoutes = new Hono<{ Variables: AuthVariables }>();

authoringRoutes.use("*", requireSession);

const me = (context: Ctx) => context.get("session").user.id;
const param = (context: Ctx, name: string, label: string) =>
  uuid(context.req.param(name), label);

// ---- reference data -----------------------------------------------------

authoringRoutes.get("/subjects", async (context) => context.json(await listAuthoringSubjects()));
authoringRoutes.get("/scenarios", async (context) => context.json(await listAuthoringScenarios()));

// ---- courses ------------------------------------------------------------

authoringRoutes.get("/courses", async (context) => context.json(await listMyCourses(me(context))));

authoringRoutes.post("/courses", async (context) => {
  const input = parseNewCourse(await readObject(context.req.raw));
  return context.json(await createCourse(me(context), input), 201);
});

authoringRoutes.get("/courses/:courseId", async (context) =>
  context.json(await getMyCourse(me(context), param(context, "courseId", "ID course"))),
);

authoringRoutes.patch("/courses/:courseId", async (context) => {
  const patch = parseCoursePatch(await readObject(context.req.raw));
  return context.json(
    await updateMyCourse(me(context), param(context, "courseId", "ID course"), patch),
  );
});

authoringRoutes.post("/courses/:courseId/join-code", async (context) =>
  context.json(await regenerateJoinCode(me(context), param(context, "courseId", "ID course"))),
);

authoringRoutes.delete("/courses/:courseId/join-code", async (context) =>
  context.json(await disableJoinCode(me(context), param(context, "courseId", "ID course"))),
);

// ---- modules ------------------------------------------------------------

authoringRoutes.post("/courses/:courseId/modules", async (context) => {
  const input = parseNewModule(await readObject(context.req.raw));
  return context.json(
    await addModule(me(context), param(context, "courseId", "ID course"), input),
    201,
  );
});

authoringRoutes.put("/courses/:courseId/modules/order", async (context) => {
  const ids = parseOrder(await readObject(context.req.raw));
  return context.json(
    await orderModules(me(context), param(context, "courseId", "ID course"), ids),
  );
});

authoringRoutes.patch("/modules/:moduleId", async (context) => {
  const patch = parseModulePatch(await readObject(context.req.raw));
  return context.json(
    await editModule(me(context), param(context, "moduleId", "ID modul"), patch),
  );
});

// DELETE never removes rows that carry student data: it archives.
authoringRoutes.delete("/modules/:moduleId", async (context) =>
  context.json(
    await editModule(me(context), param(context, "moduleId", "ID modul"), {
      status: "archived",
    }),
  ),
);

// ---- lessons ------------------------------------------------------------

authoringRoutes.post("/modules/:moduleId/lessons", async (context) => {
  const input = parseNewLesson(await readObject(context.req.raw));
  return context.json(
    await addLesson(me(context), param(context, "moduleId", "ID modul"), input),
    201,
  );
});

authoringRoutes.put("/modules/:moduleId/lessons/order", async (context) => {
  const ids = parseOrder(await readObject(context.req.raw));
  return context.json(
    await orderLessons(me(context), param(context, "moduleId", "ID modul"), ids),
  );
});

authoringRoutes.get("/lessons/:lessonId", async (context) =>
  context.json(await getMyLesson(me(context), param(context, "lessonId", "ID lesson"))),
);

authoringRoutes.patch("/lessons/:lessonId", async (context) => {
  const patch = parseLessonPatch(await readObject(context.req.raw));
  return context.json(
    await editLesson(me(context), param(context, "lessonId", "ID lesson"), patch),
  );
});

authoringRoutes.delete("/lessons/:lessonId", async (context) =>
  context.json(
    await editLesson(me(context), param(context, "lessonId", "ID lesson"), {
      status: "archived",
    }),
  ),
);

// ---- resources ----------------------------------------------------------

authoringRoutes.post("/lessons/:lessonId/resources", async (context) => {
  const input = parseResource(await readObject(context.req.raw));
  return context.json(
    await addResource(me(context), param(context, "lessonId", "ID lesson"), input),
    201,
  );
});

authoringRoutes.put("/lessons/:lessonId/resources/order", async (context) => {
  const ids = parseOrder(await readObject(context.req.raw));
  return context.json(
    await orderResources(me(context), param(context, "lessonId", "ID lesson"), ids),
  );
});

authoringRoutes.patch("/resources/:resourceId", async (context) => {
  const edit = parseResourceEdit(await readObject(context.req.raw));
  return context.json(
    await editResource(me(context), param(context, "resourceId", "ID resource"), edit),
  );
});

// Refuses an oversized body before it is buffered (the form adds a little framing).
const uploadLimit = bodyLimit({
  maxSize: MAX_PDF_BYTES + 512 * 1024,
  onError: (context) =>
    context.json({ error: `File terlalu besar (maksimal ${formatBytes(MAX_PDF_BYTES)}).` }, 413),
});

authoringRoutes.post("/lessons/:lessonId/resources/upload", uploadLimit, async (context) => {
  const upload = await parseResourceUpload(await readForm(context.req.raw));
  return context.json(
    await addResourceFile(me(context), param(context, "lessonId", "ID lesson"), upload),
    201,
  );
});

authoringRoutes.put("/resources/:resourceId/file", uploadLimit, async (context) => {
  const upload = await parseResourceUpload(await readForm(context.req.raw));
  return context.json(
    await replaceResourceUpload(me(context), param(context, "resourceId", "ID resource"), upload),
  );
});

authoringRoutes.get("/resources/:resourceId/file", async (context) =>
  fileResponse(
    context,
    await getMyResourceFile(me(context), param(context, "resourceId", "ID resource")),
  ),
);

authoringRoutes.delete("/resources/:resourceId", async (context) =>
  context.json(await removeResource(me(context), param(context, "resourceId", "ID resource"))),
);

// ---- quizzes ------------------------------------------------------------

authoringRoutes.post("/courses/:courseId/quizzes", async (context) => {
  const input = parseNewQuiz(await readObject(context.req.raw));
  return context.json(
    await createMyQuiz(me(context), param(context, "courseId", "ID course"), input),
    201,
  );
});

authoringRoutes.get("/quizzes/:quizId", async (context) =>
  context.json(await getMyQuiz(me(context), param(context, "quizId", "ID kuis"))),
);

authoringRoutes.patch("/quizzes/:quizId", async (context) => {
  const patch = parseQuizPatch(await readObject(context.req.raw));
  return context.json(
    await updateMyQuiz(me(context), param(context, "quizId", "ID kuis"), patch),
  );
});

authoringRoutes.delete("/quizzes/:quizId", async (context) =>
  context.json(
    await updateMyQuiz(me(context), param(context, "quizId", "ID kuis"), {
      status: "archived",
    }),
  ),
);

authoringRoutes.post("/quizzes/:quizId/duplicate", async (context) =>
  context.json(await copyMyQuiz(me(context), param(context, "quizId", "ID kuis")), 201),
);

authoringRoutes.post("/quizzes/:quizId/questions", async (context) => {
  const input = parseQuestion(await readObject(context.req.raw));
  return context.json(
    await addQuestion(me(context), param(context, "quizId", "ID kuis"), input),
    201,
  );
});

authoringRoutes.put("/quizzes/:quizId/questions/order", async (context) => {
  const ids = parseOrder(await readObject(context.req.raw));
  return context.json(
    await orderQuestions(me(context), param(context, "quizId", "ID kuis"), ids),
  );
});

authoringRoutes.put("/questions/:questionId", async (context) => {
  const input = parseQuestion(await readObject(context.req.raw));
  return context.json(
    await editQuestion(me(context), param(context, "questionId", "ID soal"), input),
  );
});

authoringRoutes.delete("/questions/:questionId", async (context) =>
  context.json(await removeQuestion(me(context), param(context, "questionId", "ID soal"))),
);

// ---- assignments --------------------------------------------------------

authoringRoutes.post("/courses/:courseId/assignments", async (context) => {
  const input = parseNewAssignment(await readObject(context.req.raw));
  return context.json(
    await createMyAssignment(me(context), param(context, "courseId", "ID course"), input),
    201,
  );
});

authoringRoutes.get("/assignments/:assignmentId", async (context) =>
  context.json(
    await getMyAssignment(me(context), param(context, "assignmentId", "ID assignment")),
  ),
);

authoringRoutes.patch("/assignments/:assignmentId", async (context) => {
  const patch = parseAssignmentPatch(await readObject(context.req.raw));
  return context.json(
    await updateMyAssignment(
      me(context),
      param(context, "assignmentId", "ID assignment"),
      patch,
    ),
  );
});

authoringRoutes.delete("/assignments/:assignmentId", async (context) =>
  context.json(
    await updateMyAssignment(me(context), param(context, "assignmentId", "ID assignment"), {
      status: "archived",
    }),
  ),
);

authoringRoutes.post("/assignments/:assignmentId/duplicate", async (context) =>
  context.json(
    await copyMyAssignment(me(context), param(context, "assignmentId", "ID assignment")),
    201,
  ),
);

authoringRoutes.put("/assignments/:assignmentId/criteria", async (context) => {
  const criteria = parseCriteria(await readObject(context.req.raw));
  return context.json(
    await setMyCriteria(
      me(context),
      param(context, "assignmentId", "ID assignment"),
      criteria,
    ),
  );
});
