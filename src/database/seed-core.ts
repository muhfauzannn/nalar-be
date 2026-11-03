import { asc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { account, user } from "./schema";
import { seedCoreCourses } from "./seeds/core-courses";

async function resolveOwner() {
  const args = process.argv.slice(2).filter((value) => value !== "--");
  const email = args[0]?.trim().toLowerCase();
  if (args.length > 1 || (email && !/^\S+@\S+\.\S+$/.test(email))) {
    throw new Error("Gunakan: bun run db:seed:core -- pengajar@contoh.com");
  }
  if (email) {
    const [owner] = await db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${email}`).limit(1);
    if (!owner) throw new Error("Email pengajar belum terdaftar. Daftarkan akunnya terlebih dahulu.");
    return owner;
  }
  const owners = await db.selectDistinct({ id: user.id }).from(user)
    .innerJoin(account, eq(account.userId, user.id)).orderBy(asc(user.id)).limit(2);
  if (owners.length !== 1) {
    throw new Error("Tentukan akun pengajar: bun run db:seed:core -- pengajar@contoh.com");
  }
  return owners[0]!;
}

try {
  const owner = await resolveOwner();
  const results = await seedCoreCourses(owner.id);
  for (const result of results) {
    console.log(`${result.created ? "Dibuat" : "Sudah ada, dibiarkan"}: ${result.name} — /courses/${result.courseId} · latihan /quizzes/${result.quizId}`);
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Seed course inti gagal dijalankan.");
  process.exit(1);
}
