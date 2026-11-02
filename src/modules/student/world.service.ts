import { getCourseIsland, getStudentProgress } from "../gamification/gamification.service";
import { listStudentCourseRows } from "./student.repository";
import { getStudentCourse } from "./student.service";

type Course = Awaited<ReturnType<typeof getStudentCourse>>;
type Island = Awaited<ReturnType<typeof getCourseIsland>>;

const FINISHED = new Set(["closed", "completed", "expired", "graded", "returned", "submitted"]);

/**
 * What the 3D world needs to draw an island exactly as it looks up close: which
 * places it has (with done/total for their signs) and its halls in order, each
 * with its five post states and chest. The front end lays the island out from
 * this alone (layout.ts), so the island seen from Dunia is the island you land
 * on, not a stand-in that is swapped when the course loads.
 *
 * The order mirrors the front end's districtsOf (lib/districts.ts): modules by
 * position, in each its lessons, their labs, quizzes, then assignments; then
 * the quizzes and assignments outside any module. Halls are placed in this
 * order, so it must match.
 */
export function islandSketch(course: Course, island: Island) {
  const places = {
    library: { done: 0, total: 0 },
    lab: { done: 0, total: 0 },
    arena: { done: 0, total: 0 },
  };
  const halls: Array<{ assignmentId: string; title: string; chestOpen: boolean; posts: string[] | null }> = [];
  const buildingOf = new Map(island.buildings.map((item) => [item.assignmentId, item]));
  const add = (moduleId: string | null, lessons: Course["modules"][number]["lessons"]) => {
    for (const lesson of lessons) {
      places.library.total++;
      if (lesson.status === "completed") places.library.done++;
      for (const lab of island.labs.filter((item) => item.lessonId === lesson.id)) {
        places.lab.total++;
        if (lab.challenges > 0 && lab.solved >= lab.challenges) places.lab.done++;
      }
    }
    for (const quiz of course.quizzes.filter((item) => item.moduleId === moduleId)) {
      places.arena.total++;
      if (FINISHED.has(quiz.attemptStatus ?? "")) places.arena.done++;
    }
    for (const assignment of course.assignments.filter((item) => item.moduleId === moduleId)) {
      const building = buildingOf.get(assignment.id);
      halls.push({
        assignmentId: assignment.id,
        title: assignment.title,
        chestOpen: Boolean(building?.chestOpen),
        posts: building ? building.posts.map((post) => post.status) : null,
      });
    }
  };
  for (const module of course.modules.slice().sort((a, b) => a.position - b.position)) add(module.id, module.lessons);
  add(null, []);
  return {
    places: (["library", "lab", "arena"] as const)
      .filter((place) => places[place].total > 0)
      .map((place) => ({ place, ...places[place] })),
    halls,
  };
}

// Every course as an island on one map, with where the student left off and
// enough of each island to draw it as it really is.
export async function getStudentWorld(userId: string) {
  const courses = (await listStudentCourseRows(userId)).filter((row) => row.status === "published");
  const islands = await Promise.all(
    courses.map(async (row) => {
      const [island, course] = await Promise.all([getCourseIsland(userId, row.id), getStudentCourse(userId, row.id)]);
      return { island, sketch: islandSketch(course, island) };
    }),
  );
  // After the islands: both award points still owed, one at a time.
  const progress = await getStudentProgress(userId);
  return {
    ...progress,
    islands: islands.map(({ island, sketch }) => {
      const current =
        island.buildings.find((item) => item.submissionStatus === "in_progress") ??
        island.buildings.find((item) => item.open && !item.chestOpen) ??
        null;
      const post = current?.posts.findIndex((item) => item.status === "current") ?? -1;
      return {
        course: island.course,
        halls: island.buildings.length,
        hallsDone: island.buildings.filter((item) => item.chestOpen).length,
        points: island.points.total,
        bridge: island.bridge,
        sketch,
        current: current
          ? {
              assignmentId: current.assignmentId,
              title: current.title,
              postsDone: current.posts.filter((item) => item.status === "done").length,
              post: post >= 0 ? { index: post + 1, stage: current.posts[post]!.stage } : null,
            }
          : null,
      };
    }),
  };
}
