import type { ProcessPointKind } from "./process-points.rules";

// Level, weekly rhythm and missions (canvas "Dashboard siswa", "Dunia",
// "Naik level"). All of it is derived from Poin Nalar and completed stages,
// so like the points themselves it never reads the AI Offloading Index.

const TITLES = [
  "Pendatang",
  "Penjelajah",
  "Penanya",
  "Penimbang",
  "Pengkritik",
  "Perevisi",
  "Penalar",
  "Pemikir Mandiri",
  "Cendekia",
];

// Points needed to go from `level` to the next one: 100, 150, 200, ...
const cost = (level: number) => 100 + 50 * (level - 1);

export function levelFrom(total: number) {
  let level = 1;
  let floor = 0;
  while (total >= floor + cost(level)) {
    floor += cost(level);
    level++;
  }
  return {
    level,
    title: TITLES[Math.min(level, TITLES.length) - 1]!,
    into: total - floor,
    needed: cost(level),
  };
}

export const WEEKLY_TARGET_DAYS = 3;
// Days and weeks follow the school's clock (WIB), weeks start on Monday.
const WIB_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayOf = (at: Date) => Math.floor((at.getTime() + WIB_MS) / DAY_MS);
// 1970-01-01 was a Thursday, so day 4 is the first Monday.
const weekOf = (day: number) => Math.floor((day - 4) / 7);

// A day counts when the student completed at least one stage on it: real work,
// not time spent on a page.
export function weeklyRhythm(stageCompletions: Date[], now = new Date()) {
  const daysByWeek = new Map<number, Set<number>>();
  for (const at of stageCompletions) {
    const day = dayOf(at);
    const week = weekOf(day);
    daysByWeek.set(week, (daysByWeek.get(week) ?? new Set()).add(day));
  }
  const thisWeek = weekOf(dayOf(now));
  const met = (week: number) => (daysByWeek.get(week)?.size ?? 0) >= WEEKLY_TARGET_DAYS;
  // The current week only adds to the streak once it is met; until then it
  // does not break it either.
  let streakWeeks = 0;
  for (let week = met(thisWeek) ? thisWeek : thisWeek - 1; met(week); week--) streakWeeks++;
  const activeDays = [...(daysByWeek.get(thisWeek) ?? [])].map((day) => (day - 4) % 7);
  const daysLeft = 6 - ((dayOf(now) - 4) % 7);
  return { activeDays: activeDays.sort(), target: WEEKLY_TARGET_DAYS, streakWeeks, daysLeft };
}

export function isThisWeek(at: Date, now = new Date()) {
  return weekOf(dayOf(at)) === weekOf(dayOf(now));
}

export type MissionId = "light_posts" | "ask_well" | "revise_deeply";

export function weeklyMissions(
  stageCompletionsThisWeek: number,
  eventsThisWeek: Array<{ kind: ProcessPointKind }>,
) {
  const count = (...kinds: ProcessPointKind[]) =>
    eventsThisWeek.filter((event) => kinds.includes(event.kind)).length;
  const missions: Array<{ id: MissionId; progress: number; target: number }> = [
    { id: "light_posts", progress: stageCompletionsThisWeek, target: 3 },
    { id: "ask_well", progress: count("hint_request", "reflective_question"), target: 1 },
    { id: "revise_deeply", progress: count("substantial_revision"), target: 1 },
  ];
  return missions.map((mission) => ({ ...mission, progress: Math.min(mission.progress, mission.target) }));
}

// "Bangkit": a finished assignment earns a kind of point the student's
// previous finished assignment in the same course missed. Improvement in the
// process, never in a score.
export function comebacks(
  journeys: Array<{ membershipId: string; finishedAt: Date; kinds: ProcessPointKind[] }>,
) {
  const byMembership = new Map<string, typeof journeys>();
  for (const journey of journeys) {
    byMembership.set(journey.membershipId, [...(byMembership.get(journey.membershipId) ?? []), journey]);
  }
  let total = 0;
  for (const list of byMembership.values()) {
    list.sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime());
    for (let index = 1; index < list.length; index++) {
      const before = new Set(list[index - 1]!.kinds);
      if (list[index]!.kinds.some((kind) => kind !== "journey_complete" && !before.has(kind))) total++;
    }
  }
  return total;
}
