import { describe, expect, test } from "bun:test";

import { islandSketch } from "../src/modules/student/world.service";

// The front end places halls on the island in the order of this sketch, the
// same order its districtsOf gives from the full course (lib/districts.ts in
// nalar-fe). If the two drift apart, the island seen from Dunia is not the
// island the student lands on.

type Course = Parameters<typeof islandSketch>[0];
type Island = Parameters<typeof islandSketch>[1];

const lesson = (id: string, status: "not_started" | "in_progress" | "completed" = "not_started") => ({ id, title: id, position: 1, status });
const assignment = (id: string, moduleId: string | null) => ({ id, moduleId, title: `Tugas ${id}`, dueAt: null, closesAt: null, status: "published", submissionStatus: null, currentStage: null });
const quiz = (id: string, moduleId: string | null, attemptStatus: string | null) => ({ id, moduleId, title: id, attemptStatus });
const posts = (...status: string[]) => status.map((s, i) => ({ stage: `${i + 1}_stage`, status: s, points: 0, earned: [] }));

const course = {
  modules: [
    // listed out of order on purpose: the sketch sorts by position
    { id: "m2", title: "Dua", description: null, position: 2, lessons: [lesson("l3")] },
    { id: "m1", title: "Satu", description: null, position: 1, lessons: [lesson("l1", "completed"), lesson("l2")] },
  ],
  assignments: [assignment("a-loose", null), assignment("a2", "m2"), assignment("a1", "m1"), assignment("a-gone", "m-missing")],
  quizzes: [quiz("q1", "m1", "submitted"), quiz("q2", "m2", null), quiz("q-loose", null, "expired")],
} as unknown as Course;

const island = {
  labs: [
    { id: "lab1", lessonId: "l1", labKey: "x", solved: 3, challenges: 3 },
    { id: "lab2", lessonId: "l3", labKey: "y", solved: 1, challenges: 3 },
  ],
  buildings: [
    { assignmentId: "a1", chestOpen: true, posts: posts("done", "done", "done", "done", "done") },
    { assignmentId: "a2", chestOpen: false, posts: posts("done", "current", "locked", "locked", "locked") },
  ],
} as unknown as Island;

describe("islandSketch", () => {
  const sketch = islandSketch(course, island);

  test("halls follow module position, then the loose ones; a hall in an unknown module is left out", () => {
    expect(sketch.halls.map((hall) => hall.assignmentId)).toEqual(["a1", "a2", "a-loose"]);
  });

  test("each hall carries its post states and chest, or null posts without a building", () => {
    expect(sketch.halls[0]).toEqual({ assignmentId: "a1", title: "Tugas a1", chestOpen: true, posts: ["done", "done", "done", "done", "done"] });
    expect(sketch.halls[1]!.posts).toEqual(["done", "current", "locked", "locked", "locked"]);
    expect(sketch.halls[2]).toEqual({ assignmentId: "a-loose", title: "Tugas a-loose", chestOpen: false, posts: null });
  });

  test("places count done and total like the island's signs", () => {
    expect(sketch.places).toEqual([
      { place: "library", done: 1, total: 3 },
      { place: "lab", done: 1, total: 2 },
      { place: "arena", done: 2, total: 3 },
    ]);
  });

  test("a place with nothing in it is left out", () => {
    const bare = islandSketch({ ...course, quizzes: [] } as Course, island);
    expect(bare.places.map((place) => place.place)).toEqual(["library", "lab"]);
  });
});
