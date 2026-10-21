import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../src/database/client";
import {
  api,
  joinCourse,
  makeCourse,
  makeScenario,
  multipleChoice,
  newUser,
  publishCourse,
} from "./helpers";

// The database is the last line of defence: even code that forgets a rule must
// not be able to store an impossible state. These write directly with SQL and
// expect Postgres itself to refuse.

async function pgCode(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    for (let current: any = error; current; current = current.cause) {
      if (typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) return current.code as string;
    }
    return `unexpected: ${String((error as Error).message).slice(0, 120)}`;
  }
  return "accepted";
}

const UNIQUE = "23505";
const CHECK = "23514";
const FOREIGN_KEY = "23503";
const NO_TABLE = "42P01";

describe("the school concept is really gone", () => {
  test("school tables, enums and columns no longer exist", async () => {
    for (const table of ["school", "school_membership", "school_member_role"]) {
      expect(await pgCode(db.execute(sql.raw(`select 1 from ${table}`)))).toBe(NO_TABLE);
    }
    const leftovers = await db.execute(sql`
      select table_name || '.' || column_name as ref
      from information_schema.columns
      where table_schema = 'public'
        and column_name in ('school_id', 'school_membership_id', 'membership_id')`);
    expect([...leftovers]).toEqual([]);
    const enums = await db.execute(sql`select typname from pg_type where typname in ('school_role', 'membership_status')`);
    expect([...enums]).toEqual([]);
  });
});

describe("memberships", () => {
  test("a user cannot hold the same role twice in one course", async () => {
    const teacher = await newUser("teacher");
    const student = await newUser("student");
    const course = await makeCourse(teacher);
    await publishCourse(teacher, course.id);
    await joinCourse(student, course.joinCode);
    expect(
      await pgCode(
        db.execute(sql`insert into course_membership (course_id, user_id, role, status)
                       values (${course.id}, ${student.id}, 'student', 'active')`),
      ),
    ).toBe(UNIQUE);
  });

  test("a membership must point at a real user and a real course", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    expect(
      await pgCode(
        db.execute(sql`insert into course_membership (course_id, user_id, role)
                       values (${course.id}, ${crypto.randomUUID()}, 'student')`),
      ),
    ).toBe(FOREIGN_KEY);
    expect(
      await pgCode(
        db.execute(sql`insert into course_membership (course_id, user_id, role)
                       values (${crypto.randomUUID()}, ${teacher.id}, 'student')`),
      ),
    ).toBe(FOREIGN_KEY);
  });

  test("a student profile only accepts grades 10-12 and one row per user", async () => {
    const user = await newUser("user");
    expect(await pgCode(db.execute(sql`insert into student_profile (user_id, grade_level) values (${user.id}, 9)`))).toBe(CHECK);
    expect(await pgCode(db.execute(sql`insert into student_profile (user_id, grade_level) values (${user.id}, 11)`))).toBe("accepted");
    expect(await pgCode(db.execute(sql`insert into student_profile (user_id, grade_level) values (${user.id}, 12)`))).toBe(UNIQUE);
  });
});

describe("course data", () => {
  test("class codes are unique, but any number of courses may have no code", async () => {
    const teacher = await newUser("teacher");
    const a = await makeCourse(teacher);
    const b = await makeCourse(teacher);
    expect(await pgCode(db.execute(sql`update course set join_code = ${a.joinCode} where id = ${b.id}`))).toBe(UNIQUE);
    expect(await pgCode(db.execute(sql`update course set join_code = null where id in (${a.id}, ${b.id})`))).toBe("accepted");
  });

  test("only one academic year can be active, and names are unique", async () => {
    const name = `T${crypto.randomUUID().slice(0, 6)}`;
    await db.execute(sql`update academic_year set status = 'archived'`);
    expect(
      await pgCode(
        db.execute(sql`insert into academic_year (name, starts_on, ends_on, status)
                       values (${name + "a"}, '2030-07-01', '2031-06-30', 'active')`),
      ),
    ).toBe("accepted");
    expect(
      await pgCode(
        db.execute(sql`insert into academic_year (name, starts_on, ends_on, status)
                       values (${name + "b"}, '2031-07-01', '2032-06-30', 'active')`),
      ),
    ).toBe(UNIQUE);
    expect(
      await pgCode(
        db.execute(sql`insert into academic_year (name, starts_on, ends_on) values (${name + "a"}, '2040-07-01', '2041-06-30')`),
      ),
    ).toBe(UNIQUE);
    expect(
      await pgCode(
        db.execute(sql`insert into academic_year (name, starts_on, ends_on) values (${name + "c"}, '2042-07-01', '2041-06-30')`),
      ),
    ).toBe(CHECK);
  });

  test("subject codes are globally unique", async () => {
    expect(await pgCode(db.execute(sql`insert into subject (code, name) values ('MAT', 'Duplikat')`))).toBe(UNIQUE);
  });

  test("the reference subjects shipped by the migration are present exactly once", async () => {
    const rows = await db.execute(sql`select code from subject where code in ('BIN','BING','MAT','FIS','KIM','BIO','SEJ','GEO','EKO','SOS','INF','PKN','SBD','PJOK','AGM','LNY')`);
    expect(rows).toHaveLength(16);
  });
});

describe("content invariants", () => {
  async function fixture() {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const module = await api(teacher, "POST", `/api/manage/courses/${course.id}/modules`, { title: "M" });
    const lesson = await api(teacher, "POST", `/api/manage/modules/${module.body.id}/lessons`, { title: "L" });
    const quiz = await api(teacher, "POST", `/api/manage/courses/${course.id}/quizzes`, { title: "Q" });
    const question = await api(teacher, "POST", `/api/manage/quizzes/${quiz.body.id}/questions`, multipleChoice());
    return {
      courseId: course.id,
      moduleId: module.body.id as string,
      lessonId: lesson.body.id as string,
      quizId: quiz.body.id as string,
      questionId: question.body.id as string,
    };
  }

  test("positions are positive and unique per parent", async () => {
    const f = await fixture();
    expect(await pgCode(db.execute(sql`update learning_module set position = 0 where id = ${f.moduleId}`))).toBe(CHECK);
    expect(
      await pgCode(
        db.execute(sql`insert into learning_module (course_id, title, position) values (${f.courseId}, 'Dup', 1)`),
      ),
    ).toBe(UNIQUE);
  });

  test("a resource's payload must match its type", async () => {
    const f = await fixture();
    const insert = (type: string, content: string | null, url: string | null) =>
      pgCode(
        db.execute(sql`insert into learning_resource (lesson_id, type, title, content, url, position)
                       values (${f.lessonId}, ${type}::resource_type, 'r', ${content}, ${url}, ${Math.floor(Math.random() * 1e6) + 1})`),
      );
    expect(await insert("text", null, null)).toBe(CHECK); // text needs content
    expect(await insert("text", "x", "https://a.b")).toBe(CHECK); // text must not carry a url
    expect(await insert("link", null, null)).toBe(CHECK); // link needs a url
    expect(await insert("file", null, "https://a.b/x.pdf")).toBe("accepted");
  });

  test("a question's answer key must match its type", async () => {
    const f = await fixture();
    const asArray = (accepted: string[] | null) =>
      accepted === null
        ? sql`null::text[]`
        : accepted.length === 0
          ? sql`'{}'::text[]`
          : sql`array[${sql.join(accepted.map((value) => sql`${value}`), sql`, `)}]::text[]`;
    const insert = (type: string, accepted: string[] | null, position: number) =>
      pgCode(
        db.execute(sql`insert into quiz_question (quiz_id, type, prompt, accepted_answers, position)
                       values (${f.quizId}, ${type}::quiz_question_type, 'p', ${asArray(accepted)}, ${position})`),
      );
    expect(await insert("multiple_choice", ["x"], 50)).toBe(CHECK);
    expect(await insert("short_answer", null, 51)).toBe(CHECK);
    expect(await insert("short_answer", [], 52)).toBe(CHECK);
    expect(await insert("short_answer", ["x"], 53)).toBe("accepted");
  });

  test("schedules must be in order (available <= due <= closes)", async () => {
    const f = await fixture();
    expect(
      await pgCode(
        db.execute(sql`update quiz set available_at = '2030-02-01', due_at = '2030-01-01' where id = ${f.quizId}`),
      ),
    ).toBe(CHECK);
    expect(
      await pgCode(
        db.execute(sql`update quiz set due_at = '2030-02-01', closes_at = '2030-01-01' where id = ${f.quizId}`),
      ),
    ).toBe(CHECK);
    expect(await pgCode(db.execute(sql`update quiz set time_limit_minutes = 0 where id = ${f.quizId}`))).toBe(CHECK);
  });

  test("two assignments can never share one rubric", async () => {
    const teacher = await newUser("teacher");
    const course = await makeCourse(teacher);
    const scenario = await makeScenario();
    const first = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, { scenarioId: scenario.id });
    const second = await api(teacher, "POST", `/api/manage/courses/${course.id}/assignments`, { scenarioId: scenario.id });
    expect(
      await pgCode(
        db.execute(sql`update assignment set rubric_id = (select rubric_id from assignment where id = ${first.body.id})
                       where id = ${second.body.id}`),
      ),
    ).toBe(UNIQUE);
  });

  test("a tutor conversation belongs to exactly one target", async () => {
    expect(await pgCode(db.execute(sql`insert into tutor_conversation default values`))).toBe(CHECK);
  });
});
