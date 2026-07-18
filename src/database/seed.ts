import { createHash } from "node:crypto";

import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "./client";
import {
  academicTerm,
  academicYear,
  account,
  assignment,
  course,
  courseAnnouncement,
  courseMembership,
  learningModule,
  learningResource,
  lesson,
  lessonProgress,
  quiz,
  quizAnswer,
  quizAttempt,
  quizOption,
  quizQuestion,
  rubric,
  rubricCriterion,
  rubricCriterionScore,
  scenario,
  school,
  schoolMemberRole,
  schoolMembership,
  stageArtifact,
  stageProgress,
  studentProfile,
  subject,
  submission,
  submissionAssessment,
  user,
} from "./schema";

const DAY = 24 * 60 * 60 * 1_000;

function id(key: string) {
  const bytes = createHash("sha256").update(`nalar-seed:${key}`).digest().subarray(0, 16);
  bytes.set([((bytes.at(6) ?? 0) & 0x0f) | 0x40], 6);
  bytes.set([((bytes.at(8) ?? 0) & 0x3f) | 0x80], 8);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * DAY);
}

function academicPeriod(now: Date) {
  const startingYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `${startingYear}/${startingYear + 1}`,
    startsOn: `${startingYear}-07-01`,
    endsOn: `${startingYear + 1}-06-30`,
    termStartsOn: `${startingYear}-07-01`,
    termEndsOn: `${startingYear}-12-31`,
  };
}

function requestedEmail() {
  const argument = process.argv[2]?.trim();
  if (!argument) return null;
  if (!/^\S+@\S+\.\S+$/.test(argument)) {
    throw new Error(
      "Email seed tidak valid. Gunakan: bun run db:seed -- nama@contoh.com",
    );
  }
  return argument.toLowerCase();
}

async function resolveStudent() {
  const email = requestedEmail();
  if (email) {
    const [matchedUser] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(sql`lower(${user.email}) = ${email}`)
      .limit(1);
    if (!matchedUser) {
      throw new Error(
        `Akun ${email} belum terdaftar. Register melalui Better Auth terlebih dahulu.`,
      );
    }
    return matchedUser;
  }

  const registeredUsers = await db
    .selectDistinct({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .innerJoin(account, eq(account.userId, user.id))
    .orderBy(asc(user.id))
    .limit(2);
  if (registeredUsers.length === 1 && registeredUsers[0]) return registeredUsers[0];
  if (registeredUsers.length === 0) {
    throw new Error("Belum ada akun terdaftar. Register terlebih dahulu sebelum menjalankan seed.");
  }
  throw new Error(
    "Ada lebih dari satu akun. Pilih student dengan: bun run db:seed -- nama@contoh.com",
  );
}

async function seed() {
  const student = await resolveStudent();
  const now = new Date();
  const period = academicPeriod(now);

  const ids = {
    school: id("school:sman-nalar-nusantara"),
    teacherUser: id("user:guru-demo"),
    studentMembership: id(`membership:student:${student.id}`),
    teacherMembership: id("membership:teacher-demo"),
    year: id(`academic-year:${period.name}`),
    term: id(`academic-term:${period.name}:ganjil`),
    bahasaSubject: id("subject:bahasa-indonesia"),
    biologySubject: id("subject:biologi"),
    bahasaCourse: id(`course:${period.name}:bahasa-indonesia-xi`),
    biologyCourse: id(`course:${period.name}:biologi-xi`),
    bahasaStudentCourse: id(`course-membership:bahasa:${student.id}`),
    biologyStudentCourse: id(`course-membership:biologi:${student.id}`),
    bahasaTeacherCourse: id("course-membership:bahasa:teacher-demo"),
    biologyTeacherCourse: id("course-membership:biologi:teacher-demo"),
    argumentModule: id("module:bahasa:argumentasi"),
    editorialModule: id("module:bahasa:editorial"),
    cellModule: id("module:biologi:sel"),
    argumentLesson: id("lesson:bahasa:struktur-argumentasi"),
    evidenceLesson: id("lesson:bahasa:bukti-dan-sumber"),
    editorialLesson: id("lesson:bahasa:membaca-editorial"),
    revisionLesson: id("lesson:bahasa:revisi-tulisan"),
    cellLesson: id("lesson:biologi:struktur-sel"),
    transportLesson: id("lesson:biologi:transport-membran"),
    baseRubric: id("rubric:argumentasi-template"),
    climateRubric: id("rubric:assignment:climate"),
    mediaRubric: id("rubric:assignment:media"),
    biologyRubric: id("rubric:assignment:biology"),
    climateScenario: id("scenario:climate"),
    mediaScenario: id("scenario:media"),
    biologyScenario: id("scenario:biology"),
    climateAssignment: id("assignment:climate"),
    mediaAssignment: id("assignment:media"),
    biologyAssignment: id("assignment:biology"),
    climateSubmission: id(`submission:climate:${student.id}`),
    mediaSubmission: id(`submission:media:${student.id}`),
    climateAssessment: id(`assessment:climate:${student.id}`),
    bahasaQuiz: id("quiz:bahasa:argumentasi"),
    sourceQuiz: id("quiz:bahasa:evaluasi-sumber"),
    biologyQuiz: id("quiz:biologi:sel"),
    membraneQuiz: id("quiz:biologi:transport-membran"),
    bahasaAttempt: id(`quiz-attempt:bahasa:${student.id}`),
  } as const;

  await db.transaction(async (transaction) => {
    await transaction
      .insert(user)
      .values({
        id: ids.teacherUser,
        name: "Ibu Ratna Wulandari",
        email: "guru.demo@nalar.local",
        emailVerified: true,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: { name: "Ibu Ratna Wulandari", emailVerified: true, updatedAt: now },
      });

    await transaction
      .insert(school)
      .values({ id: ids.school, name: "SMA Nalar Nusantara", slug: "sma-nalar-nusantara" })
      .onConflictDoUpdate({
        target: school.id,
        set: { name: "SMA Nalar Nusantara", deletedAt: null, updatedAt: now },
      });

    await transaction
      .insert(schoolMembership)
      .values([
        {
          id: ids.studentMembership,
          schoolId: ids.school,
          userId: student.id,
          status: "active",
          joinedAt: daysFromNow(-120),
        },
        {
          id: ids.teacherMembership,
          schoolId: ids.school,
          userId: ids.teacherUser,
          status: "active",
          joinedAt: daysFromNow(-365),
        },
      ])
      .onConflictDoUpdate({
        target: schoolMembership.id,
        set: { status: "active", updatedAt: now },
      });
    await transaction
      .insert(schoolMemberRole)
      .values([
        { membershipId: ids.studentMembership, role: "student" },
        { membershipId: ids.teacherMembership, role: "teacher" },
      ])
      .onConflictDoNothing();
    await transaction
      .insert(studentProfile)
      .values({ membershipId: ids.studentMembership, gradeLevel: 11 })
      .onConflictDoUpdate({
        target: studentProfile.membershipId,
        set: { gradeLevel: 11, updatedAt: now },
      });

    await transaction
      .update(academicYear)
      .set({ status: "archived", updatedAt: now })
      .where(
        and(
          eq(academicYear.schoolId, ids.school),
          eq(academicYear.status, "active"),
          ne(academicYear.id, ids.year),
        ),
      );
    await transaction
      .insert(academicYear)
      .values({
        id: ids.year,
        schoolId: ids.school,
        name: period.name,
        startsOn: period.startsOn,
        endsOn: period.endsOn,
        status: "active",
      })
      .onConflictDoUpdate({
        target: academicYear.id,
        set: {
          name: period.name,
          startsOn: period.startsOn,
          endsOn: period.endsOn,
          status: "active",
          updatedAt: now,
        },
      });
    await transaction
      .insert(academicTerm)
      .values({
        id: ids.term,
        academicYearId: ids.year,
        name: "Semester Ganjil",
        position: 1,
        startsOn: period.termStartsOn,
        endsOn: period.termEndsOn,
      })
      .onConflictDoUpdate({
        target: academicTerm.id,
        set: {
          name: "Semester Ganjil",
          startsOn: period.termStartsOn,
          endsOn: period.termEndsOn,
          updatedAt: now,
        },
      });

    await transaction
      .insert(subject)
      .values([
        { id: ids.bahasaSubject, schoolId: ids.school, code: "BIN-XI", name: "Bahasa Indonesia" },
        { id: ids.biologySubject, schoolId: ids.school, code: "BIO-XI", name: "Biologi" },
      ])
      .onConflictDoUpdate({
        target: subject.id,
        set: { updatedAt: now },
      });
    await transaction
      .insert(course)
      .values([
        {
          id: ids.bahasaCourse,
          schoolId: ids.school,
          termId: ids.term,
          subjectId: ids.bahasaSubject,
          name: "Bahasa Indonesia XI",
          description: "Menalar, menyusun argumen, dan menulis teks berbasis bukti.",
          status: "published",
        },
        {
          id: ids.biologyCourse,
          schoolId: ids.school,
          termId: ids.term,
          subjectId: ids.biologySubject,
          name: "Biologi XI",
          description: "Mengkaji struktur sel dan proses kehidupan melalui observasi ilmiah.",
          status: "published",
        },
      ])
      .onConflictDoUpdate({
        target: course.id,
        set: { status: "published", updatedAt: now },
      });
    await transaction
      .insert(courseMembership)
      .values([
        {
          id: ids.bahasaStudentCourse,
          courseId: ids.bahasaCourse,
          schoolMembershipId: ids.studentMembership,
          role: "student",
          status: "active",
          activatedAt: daysFromNow(-90),
        },
        {
          id: ids.biologyStudentCourse,
          courseId: ids.biologyCourse,
          schoolMembershipId: ids.studentMembership,
          role: "student",
          status: "active",
          activatedAt: daysFromNow(-90),
        },
        {
          id: ids.bahasaTeacherCourse,
          courseId: ids.bahasaCourse,
          schoolMembershipId: ids.teacherMembership,
          role: "teacher",
          status: "active",
          activatedAt: daysFromNow(-120),
        },
        {
          id: ids.biologyTeacherCourse,
          courseId: ids.biologyCourse,
          schoolMembershipId: ids.teacherMembership,
          role: "teacher",
          status: "active",
          activatedAt: daysFromNow(-120),
        },
      ])
      .onConflictDoUpdate({
        target: courseMembership.id,
        set: { status: "active", updatedAt: now },
      });

    await transaction
      .insert(learningModule)
      .values([
        {
          id: ids.argumentModule,
          courseId: ids.bahasaCourse,
          title: "Membangun Argumen",
          description: "Menyusun klaim yang didukung alasan dan bukti.",
          position: 1,
          status: "published",
          publishedAt: daysFromNow(-60),
        },
        {
          id: ids.editorialModule,
          courseId: ids.bahasaCourse,
          title: "Teks Editorial",
          description: "Menganalisis sudut pandang dan menyunting tulisan argumentatif.",
          position: 2,
          status: "published",
          publishedAt: daysFromNow(-30),
        },
        {
          id: ids.cellModule,
          courseId: ids.biologyCourse,
          title: "Sel sebagai Unit Kehidupan",
          description: "Menghubungkan struktur organel dengan fungsi sel.",
          position: 1,
          status: "published",
          publishedAt: daysFromNow(-45),
        },
      ])
      .onConflictDoUpdate({
        target: learningModule.id,
        set: { status: "published", updatedAt: now },
      });

    await transaction
      .insert(lesson)
      .values([
        {
          id: ids.argumentLesson,
          moduleId: ids.argumentModule,
          title: "Klaim, Alasan, dan Bukti",
          content: "Argumen yang kuat memisahkan klaim, alasan, dan bukti. Klaim menjawab posisi yang kita ambil, alasan menerangkan mengapa posisi itu masuk akal, sedangkan bukti memberi dasar yang dapat diperiksa.",
          position: 1,
          status: "published",
          publishedAt: daysFromNow(-60),
        },
        {
          id: ids.evidenceLesson,
          moduleId: ids.argumentModule,
          title: "Memeriksa Kredibilitas Sumber",
          content: "Nilai sumber dari otoritas penulis, ketepatan metode, kebaruan informasi, dan kemungkinan bias. Bandingkan lebih dari satu sumber sebelum menarik kesimpulan.",
          position: 2,
          status: "published",
          publishedAt: daysFromNow(-50),
        },
        {
          id: ids.editorialLesson,
          moduleId: ids.editorialModule,
          title: "Membaca Teks Editorial secara Kritis",
          content: "Temukan tesis, rangkaian argumen, dan rekomendasi penulis. Perhatikan data mana yang dipakai dan sudut pandang mana yang tidak ditampilkan.",
          position: 1,
          status: "published",
          publishedAt: daysFromNow(-30),
        },
        {
          id: ids.revisionLesson,
          moduleId: ids.editorialModule,
          title: "Merevisi agar Lebih Meyakinkan",
          content: "Revisi bukan sekadar memperbaiki ejaan. Periksa kembali hubungan antar gagasan, kecukupan bukti, dan apakah sanggahan sudah dijawab secara adil.",
          position: 2,
          status: "published",
          publishedAt: daysFromNow(-20),
        },
        {
          id: ids.cellLesson,
          moduleId: ids.cellModule,
          title: "Struktur dan Fungsi Organel",
          content: "Setiap organel menjalankan fungsi khusus. Hubungan antarfungsi membuat sel mampu memperoleh energi, menyintesis protein, dan menjaga keseimbangan internal.",
          position: 1,
          status: "published",
          publishedAt: daysFromNow(-45),
        },
        {
          id: ids.transportLesson,
          moduleId: ids.cellModule,
          title: "Transport Melalui Membran",
          content: "Difusi, osmosis, dan transport aktif menjelaskan perpindahan zat melalui membran. Arah perpindahan dipengaruhi gradien konsentrasi dan kebutuhan energi.",
          position: 2,
          status: "published",
          publishedAt: daysFromNow(-35),
        },
      ])
      .onConflictDoUpdate({
        target: lesson.id,
        set: { status: "published", updatedAt: now },
      });

    await transaction
      .insert(learningResource)
      .values([
        {
          id: id("resource:argument:ringkasan"),
          lessonId: ids.argumentLesson,
          type: "text",
          title: "Ringkasan konsep",
          content: "Klaim menyatakan posisi; alasan membangun logika; bukti menguji apakah alasan dapat dipercaya.",
          position: 1,
        },
        {
          id: id("resource:evidence:checklist"),
          lessonId: ids.evidenceLesson,
          type: "text",
          title: "Checklist evaluasi sumber",
          content: "Periksa penulis, penerbit, tanggal, metode, referensi, dan konflik kepentingan.",
          position: 1,
        },
        {
          id: id("resource:cell:reference"),
          lessonId: ids.cellLesson,
          type: "link",
          title: "Referensi organel sel",
          url: "https://id.wikipedia.org/wiki/Organel",
          position: 1,
        },
      ])
      .onConflictDoUpdate({
        target: learningResource.id,
        set: { updatedAt: now },
      });

    await transaction
      .insert(lessonProgress)
      .values([
        {
          id: id(`progress:argument:${student.id}`),
          lessonId: ids.argumentLesson,
          studentCourseMembershipId: ids.bahasaStudentCourse,
          status: "completed",
          startedAt: daysFromNow(-42),
          completedAt: daysFromNow(-40),
        },
        {
          id: id(`progress:evidence:${student.id}`),
          lessonId: ids.evidenceLesson,
          studentCourseMembershipId: ids.bahasaStudentCourse,
          status: "completed",
          startedAt: daysFromNow(-35),
          completedAt: daysFromNow(-34),
        },
        {
          id: id(`progress:editorial:${student.id}`),
          lessonId: ids.editorialLesson,
          studentCourseMembershipId: ids.bahasaStudentCourse,
          status: "in_progress",
          startedAt: daysFromNow(-2),
        },
        {
          id: id(`progress:cell:${student.id}`),
          lessonId: ids.cellLesson,
          studentCourseMembershipId: ids.biologyStudentCourse,
          status: "completed",
          startedAt: daysFromNow(-20),
          completedAt: daysFromNow(-19),
        },
      ])
      .onConflictDoUpdate({
        target: lessonProgress.id,
        set: { updatedAt: now },
      });

    await transaction
      .insert(courseAnnouncement)
      .values([
        {
          id: id("announcement:bahasa:welcome"),
          courseId: ids.bahasaCourse,
          authorCourseMembershipId: ids.bahasaTeacherCourse,
          title: "Selamat datang di kelas",
          body: "Gunakan setiap tahap NALAR untuk menunjukkan perkembangan cara berpikir, bukan hanya jawaban akhir.",
          status: "published",
          publishedAt: daysFromNow(-14),
        },
        {
          id: id("announcement:biology:lab"),
          courseId: ids.biologyCourse,
          authorCourseMembershipId: ids.biologyTeacherCourse,
          title: "Persiapan pengamatan sel",
          body: "Baca materi struktur organel sebelum praktikum dan catat dua pertanyaan yang ingin kalian uji.",
          status: "published",
          publishedAt: daysFromNow(-5),
        },
      ])
      .onConflictDoUpdate({
        target: courseAnnouncement.id,
        set: { status: "published", updatedAt: now },
      });

    const rubricRows = [
      { id: ids.baseRubric, name: "Rubrik Argumentasi NALAR", isTemplate: true },
      { id: ids.climateRubric, name: "Rubrik Editorial Iklim", isTemplate: false },
      { id: ids.mediaRubric, name: "Rubrik Literasi Media", isTemplate: false },
      { id: ids.biologyRubric, name: "Rubrik Penjelasan Biologi", isTemplate: false },
    ];
    await transaction
      .insert(rubric)
      .values(rubricRows.map((row) => ({ ...row, schoolId: ids.school, lockedAt: now })))
      .onConflictDoUpdate({ target: rubric.id, set: { updatedAt: now } });

    const criterionDefinitions = [
      ["Kejelasan klaim", "Klaim fokus dan menjawab persoalan.", "25.00"],
      ["Kualitas bukti", "Bukti relevan, kredibel, dan dijelaskan kaitannya.", "30.00"],
      ["Penalaran", "Alasan tersusun logis dan menanggapi kemungkinan sanggahan.", "30.00"],
      ["Refleksi", "Refleksi menjelaskan perubahan pemikiran dan penggunaan AI.", "15.00"],
    ] as const;
    const rubricIds = [ids.baseRubric, ids.climateRubric, ids.mediaRubric, ids.biologyRubric];
    const criteria = rubricIds.flatMap((rubricId) =>
      criterionDefinitions.map(([label, description, maxPoints], index) => ({
        id: id(`criterion:${rubricId}:${index + 1}`),
        rubricId,
        label,
        description,
        maxPoints,
        position: index + 1,
      })),
    );
    await transaction
      .insert(rubricCriterion)
      .values(criteria)
      .onConflictDoUpdate({ target: rubricCriterion.id, set: { updatedAt: now } });

    await transaction
      .insert(scenario)
      .values([
        {
          id: ids.climateScenario,
          schoolId: ids.school,
          subjectId: ids.bahasaSubject,
          title: "Editorial Kebijakan Iklim Sekolah",
          instructions: "Susun editorial berbasis bukti tentang kebijakan pengurangan sampah sekolah.",
          defaultRubricId: ids.baseRubric,
        },
        {
          id: ids.mediaScenario,
          schoolId: ids.school,
          subjectId: ids.bahasaSubject,
          title: "Literasi Media di Kalangan Remaja",
          instructions: "Tulis argumen tentang cara sekolah membangun kebiasaan verifikasi informasi.",
          defaultRubricId: ids.baseRubric,
        },
        {
          id: ids.biologyScenario,
          schoolId: ids.school,
          subjectId: ids.biologySubject,
          title: "Sel dalam Larutan Berbeda",
          instructions: "Jelaskan prediksi perubahan sel dalam larutan hipotonik dan hipertonik.",
          defaultRubricId: ids.baseRubric,
        },
      ])
      .onConflictDoUpdate({ target: scenario.id, set: { isActive: true, updatedAt: now } });

    await transaction
      .insert(assignment)
      .values([
        {
          id: ids.climateAssignment,
          courseId: ids.bahasaCourse,
          moduleId: ids.argumentModule,
          scenarioId: ids.climateScenario,
          rubricId: ids.climateRubric,
          createdByCourseMembershipId: ids.bahasaTeacherCourse,
          title: "Editorial Kebijakan Sampah Sekolah",
          instructions: "Tulis editorial 500–700 kata. Gunakan sekurangnya dua bukti dan jelaskan bagaimana AI membantu tanpa menggantikan keputusanmu.",
          status: "closed",
          availableAt: daysFromNow(-35),
          dueAt: daysFromNow(-21),
          closesAt: daysFromNow(-18),
          publishedAt: daysFromNow(-36),
        },
        {
          id: ids.mediaAssignment,
          courseId: ids.bahasaCourse,
          moduleId: ids.editorialModule,
          scenarioId: ids.mediaScenario,
          rubricId: ids.mediaRubric,
          createdByCourseMembershipId: ids.bahasaTeacherCourse,
          title: "Argumen Literasi Media",
          instructions: "Bangun argumen tentang satu kebiasaan verifikasi informasi yang perlu diterapkan di sekolah.",
          status: "published",
          availableAt: daysFromNow(-3),
          dueAt: daysFromNow(5),
          closesAt: daysFromNow(8),
          publishedAt: daysFromNow(-4),
        },
        {
          id: ids.biologyAssignment,
          courseId: ids.biologyCourse,
          moduleId: ids.cellModule,
          scenarioId: ids.biologyScenario,
          rubricId: ids.biologyRubric,
          createdByCourseMembershipId: ids.biologyTeacherCourse,
          title: "Prediksi Osmosis pada Sel",
          instructions: "Jelaskan prediksi dan alasan ilmiah untuk sel tumbuhan dalam tiga konsentrasi larutan.",
          status: "published",
          availableAt: daysFromNow(-1),
          dueAt: daysFromNow(9),
          closesAt: daysFromNow(12),
          publishedAt: daysFromNow(-2),
        },
      ])
      .onConflictDoUpdate({
        target: assignment.id,
        set: {
          status: sql`excluded.status`,
          availableAt: sql`excluded.available_at`,
          dueAt: sql`excluded.due_at`,
          closesAt: sql`excluded.closes_at`,
          publishedAt: sql`excluded.published_at`,
          updatedAt: now,
        },
      });

    await transaction
      .insert(submission)
      .values([
        {
          id: ids.climateSubmission,
          assignmentId: ids.climateAssignment,
          studentCourseMembershipId: ids.bahasaStudentCourse,
          attemptNumber: 1,
          status: "returned",
          currentStage: "5_reflection",
          startedAt: daysFromNow(-32),
          submittedAt: daysFromNow(-23),
          returnedAt: daysFromNow(-20),
        },
        {
          id: ids.mediaSubmission,
          assignmentId: ids.mediaAssignment,
          studentCourseMembershipId: ids.bahasaStudentCourse,
          attemptNumber: 1,
          status: "in_progress",
          currentStage: "3_ai_evaluation",
          startedAt: daysFromNow(-2),
        },
      ])
      .onConflictDoUpdate({ target: submission.id, set: { updatedAt: now } });

    const stages = [
      "1_independent_effort",
      "2_guided_questioning",
      "3_ai_evaluation",
      "4_revision_finalization",
      "5_reflection",
    ] as const;
    await transaction
      .insert(stageProgress)
      .values([
        ...stages.map((stage, index) => ({
          id: id(`stage-progress:climate:${student.id}:${stage}`),
          submissionId: ids.climateSubmission,
          stage,
          status: "completed" as const,
          startedAt: daysFromNow(-32 + index * 2),
          completedAt: daysFromNow(-31 + index * 2),
        })),
        ...stages.map((stage, index) => ({
          id: id(`stage-progress:media:${student.id}:${stage}`),
          submissionId: ids.mediaSubmission,
          stage,
          status: index < 2 ? ("completed" as const) : index === 2 ? ("in_progress" as const) : ("locked" as const),
          startedAt: index <= 2 ? daysFromNow(-2 + index) : null,
          completedAt: index < 2 ? daysFromNow(-1 + index) : null,
        })),
      ])
      .onConflictDoUpdate({ target: stageProgress.id, set: { updatedAt: now } });

    await transaction
      .insert(stageArtifact)
      .values([
        {
          id: id(`artifact:climate:stage1:${student.id}`),
          submissionId: ids.climateSubmission,
          stage: "1_independent_effort",
          content: "Sekolah perlu membatasi plastik sekali pakai karena sebagian besar sampah harian kantin berasal dari kemasan yang sulit dipilah.",
          version: 1,
          isFinal: true,
        },
        {
          id: id(`artifact:climate:stage3:${student.id}`),
          submissionId: ids.climateSubmission,
          stage: "3_ai_evaluation",
          content: "Saran AI membantu menemukan sanggahan, tetapi dua angka yang diberikan tidak memiliki sumber sehingga saya tidak memakainya.",
          version: 1,
          isFinal: true,
        },
        {
          id: id(`artifact:climate:stage4:${student.id}`),
          submissionId: ids.climateSubmission,
          stage: "4_revision_finalization",
          content: "Kebijakan isi ulang dan insentif wadah pakai ulang lebih dapat diterapkan daripada larangan mendadak karena tetap mempertimbangkan kesiapan kantin.",
          version: 1,
          isFinal: true,
        },
        {
          id: id(`artifact:climate:stage5:${student.id}`),
          submissionId: ids.climateSubmission,
          stage: "5_reflection",
          content: "Saya awalnya hanya menekankan larangan. Setelah mengevaluasi sanggahan, saya mengubah posisi menjadi penerapan bertahap. AI dipakai untuk menguji argumen, sedangkan pemilihan bukti dan keputusan akhir tetap saya lakukan.",
          version: 1,
          isFinal: true,
        },
        {
          id: id(`artifact:media:stage1:${student.id}`),
          submissionId: ids.mediaSubmission,
          stage: "1_independent_effort",
          content: "Sekolah perlu membiasakan siswa memeriksa sumber asli sebelum meneruskan informasi di grup kelas.",
          version: 1,
          isFinal: true,
        },
      ])
      .onConflictDoUpdate({ target: stageArtifact.id, set: { updatedAt: now } });

    await transaction
      .insert(submissionAssessment)
      .values({
        id: ids.climateAssessment,
        submissionId: ids.climateSubmission,
        gradedByCourseMembershipId: ids.bahasaTeacherCourse,
        score: "86.00",
        feedback: "Argumen jelas dan refleksi penggunaan AI jujur. Hubungan antara bukti dan rekomendasi masih dapat dibuat lebih eksplisit.",
        gradedAt: daysFromNow(-20),
      })
      .onConflictDoUpdate({ target: submissionAssessment.id, set: { updatedAt: now } });
    const climateCriteria = criteria.filter((criterion) => criterion.rubricId === ids.climateRubric);
    const criterionScores = ["23.00", "25.00", "25.00", "13.00"];
    await transaction
      .insert(rubricCriterionScore)
      .values(
        climateCriteria.map((criterion, index) => ({
          id: id(`criterion-score:climate:${student.id}:${criterion.position}`),
          assessmentId: ids.climateAssessment,
          criterionId: criterion.id,
          score: criterionScores[index] ?? "0.00",
          feedback: index === 1 ? "Tambahkan penjelasan yang lebih kuat tentang relevansi data." : null,
        })),
      )
      .onConflictDoUpdate({ target: rubricCriterionScore.id, set: { updatedAt: now } });

    await transaction
      .insert(quiz)
      .values([
        {
          id: ids.bahasaQuiz,
          courseId: ids.bahasaCourse,
          moduleId: ids.argumentModule,
          createdByCourseMembershipId: ids.bahasaTeacherCourse,
          title: "Quiz Dasar Argumentasi",
          instructions: "Pilih jawaban yang paling tepat.",
          status: "closed",
          availableAt: daysFromNow(-30),
          dueAt: daysFromNow(-25),
          closesAt: daysFromNow(-24),
          timeLimitMinutes: 15,
          publishedAt: daysFromNow(-31),
        },
        {
          id: ids.sourceQuiz,
          courseId: ids.bahasaCourse,
          moduleId: ids.argumentModule,
          createdByCourseMembershipId: ids.bahasaTeacherCourse,
          title: "Cek Pemahaman Evaluasi Sumber",
          instructions: "Kerjakan pilihan ganda dan isian singkat. Gunakan istilah yang paling tepat.",
          status: "published",
          availableAt: daysFromNow(-1),
          dueAt: daysFromNow(7),
          closesAt: daysFromNow(9),
          timeLimitMinutes: 20,
          publishedAt: daysFromNow(-2),
        },
        {
          id: ids.biologyQuiz,
          courseId: ids.biologyCourse,
          moduleId: ids.cellModule,
          createdByCourseMembershipId: ids.biologyTeacherCourse,
          title: "Quiz Struktur Sel",
          instructions: "Jawab semua soal dalam 20 menit.",
          status: "published",
          availableAt: daysFromNow(-1),
          dueAt: daysFromNow(4),
          closesAt: daysFromNow(6),
          timeLimitMinutes: 20,
          publishedAt: daysFromNow(-2),
        },
        {
          id: ids.membraneQuiz,
          courseId: ids.biologyCourse,
          moduleId: ids.cellModule,
          createdByCourseMembershipId: ids.biologyTeacherCourse,
          title: "Latihan Transport Membran",
          instructions: "Jawab setiap konsep dengan pilihan atau istilah biologis yang tepat.",
          status: "published",
          availableAt: daysFromNow(1),
          dueAt: daysFromNow(10),
          closesAt: daysFromNow(12),
          timeLimitMinutes: 20,
          publishedAt: daysFromNow(-1),
        },
      ])
      .onConflictDoUpdate({
        target: quiz.id,
        set: {
          title: sql`excluded.title`,
          instructions: sql`excluded.instructions`,
          status: sql`excluded.status`,
          availableAt: sql`excluded.available_at`,
          dueAt: sql`excluded.due_at`,
          closesAt: sql`excluded.closes_at`,
          timeLimitMinutes: sql`excluded.time_limit_minutes`,
          publishedAt: sql`excluded.published_at`,
          updatedAt: now,
        },
      });

    const questionIds = {
      bahasaClaim: id("question:bahasa:1"),
      bahasaVerify: id("question:bahasa:2"),
      sourcePrimary: id("question:source:1"),
      sourceBias: id("question:source:2"),
      sourceFact: id("question:source:3"),
      sourceCrossCheck: id("question:source:4"),
      sourceRecency: id("question:source:5"),
      biologyMitochondria: id("question:biology:1"),
      biologyOsmosis: id("question:biology:2"),
      biologyPlantCell: id("question:biology:3"),
      biologyRibosome: id("question:biology:4"),
      biologyNucleus: id("question:biology:5"),
      membraneOsmosis: id("question:membrane:1"),
      membranePassive: id("question:membrane:2"),
      membraneEnergy: id("question:membrane:3"),
      membraneHypertonic: id("question:membrane:4"),
      membraneChannel: id("question:membrane:5"),
    } as const;
    const questions: Array<typeof quizQuestion.$inferInsert> = [
      {
        id: questionIds.bahasaClaim,
        quizId: ids.bahasaQuiz,
        type: "multiple_choice",
        prompt: "Bagian argumen yang menyatakan posisi utama disebut ...",
        explanation: "Klaim menyatakan posisi atau kesimpulan utama yang hendak dipertahankan.",
        acceptedAnswers: null,
        points: "1.00",
        position: 1,
      },
      {
        id: questionIds.bahasaVerify,
        quizId: ids.bahasaQuiz,
        type: "multiple_choice",
        prompt: "Tindakan terbaik saat menemukan data tanpa sumber adalah ...",
        explanation: "Data perlu diverifikasi melalui sumber asli atau sumber kredibel lain sebelum dipakai.",
        acceptedAnswers: null,
        points: "1.00",
        position: 2,
      },
      {
        id: questionIds.sourcePrimary,
        quizId: ids.sourceQuiz,
        type: "multiple_choice",
        prompt: "Manakah yang merupakan sumber primer untuk menilai kebijakan sekolah?",
        explanation: "Dokumen kebijakan asli merupakan bukti langsung, bukan ringkasan pihak lain.",
        acceptedAnswers: null,
        points: "1.00",
        position: 1,
      },
      {
        id: questionIds.sourceBias,
        quizId: ids.sourceQuiz,
        type: "short_answer",
        prompt: "Apa istilah untuk kecenderungan sudut pandang yang dapat memengaruhi penyajian informasi?",
        explanation: "Bias adalah kecenderungan yang dapat memengaruhi pemilihan atau penyajian informasi.",
        acceptedAnswers: ["bias", "bias informasi"],
        points: "1.00",
        position: 2,
      },
      {
        id: questionIds.sourceFact,
        quizId: ids.sourceQuiz,
        type: "multiple_choice",
        prompt: "Pernyataan yang dapat diuji dengan bukti disebut ...",
        explanation: "Fakta dapat diverifikasi melalui bukti, sedangkan opini memuat penilaian personal.",
        acceptedAnswers: null,
        points: "1.00",
        position: 3,
      },
      {
        id: questionIds.sourceCrossCheck,
        quizId: ids.sourceQuiz,
        type: "short_answer",
        prompt: "Sebutkan proses membandingkan informasi dengan sumber independen lain.",
        explanation: "Verifikasi silang membandingkan klaim pada lebih dari satu sumber independen.",
        acceptedAnswers: ["verifikasi silang", "cross check", "cek silang"],
        points: "1.00",
        position: 4,
      },
      {
        id: questionIds.sourceRecency,
        quizId: ids.sourceQuiz,
        type: "multiple_choice",
        prompt: "Mengapa tanggal publikasi perlu diperiksa?",
        explanation: "Tanggal membantu menilai apakah informasi masih relevan dengan konteks saat ini.",
        acceptedAnswers: null,
        points: "1.00",
        position: 5,
      },
      {
        id: questionIds.biologyMitochondria,
        quizId: ids.biologyQuiz,
        type: "multiple_choice",
        prompt: "Organel utama penghasil ATP adalah ...",
        explanation: "Mitokondria menjalankan respirasi sel untuk menghasilkan ATP.",
        acceptedAnswers: null,
        points: "1.00",
        position: 1,
      },
      {
        id: questionIds.biologyOsmosis,
        quizId: ids.biologyQuiz,
        type: "multiple_choice",
        prompt: "Perpindahan air melalui membran semipermeabel disebut ...",
        explanation: "Osmosis adalah perpindahan molekul air melalui membran semipermeabel.",
        acceptedAnswers: null,
        points: "1.00",
        position: 2,
      },
      {
        id: questionIds.biologyPlantCell,
        quizId: ids.biologyQuiz,
        type: "multiple_choice",
        prompt: "Struktur yang hanya dimiliki sel tumbuhan adalah ...",
        explanation: "Dinding sel dan kloroplas merupakan struktur khas sel tumbuhan.",
        acceptedAnswers: null,
        points: "1.00",
        position: 3,
      },
      {
        id: questionIds.biologyRibosome,
        quizId: ids.biologyQuiz,
        type: "short_answer",
        prompt: "Organel apakah yang menjadi tempat sintesis protein?",
        explanation: "Ribosom membaca mRNA dan merangkai asam amino menjadi protein.",
        acceptedAnswers: ["ribosom"],
        points: "1.00",
        position: 4,
      },
      {
        id: questionIds.biologyNucleus,
        quizId: ids.biologyQuiz,
        type: "short_answer",
        prompt: "Apa nama organel yang menyimpan sebagian besar materi genetik sel eukariotik?",
        explanation: "Nukleus atau inti sel menyimpan sebagian besar DNA pada sel eukariotik.",
        acceptedAnswers: ["nukleus", "inti sel"],
        points: "1.00",
        position: 5,
      },
      {
        id: questionIds.membraneOsmosis,
        quizId: ids.membraneQuiz,
        type: "short_answer",
        prompt: "Apa nama perpindahan air melewati membran semipermeabel?",
        explanation: "Osmosis adalah perpindahan air melalui membran semipermeabel.",
        acceptedAnswers: ["osmosis"],
        points: "1.00",
        position: 1,
      },
      {
        id: questionIds.membranePassive,
        quizId: ids.membraneQuiz,
        type: "multiple_choice",
        prompt: "Transport yang tidak memerlukan energi sel disebut ...",
        explanation: "Transport pasif mengikuti gradien konsentrasi tanpa menggunakan ATP.",
        acceptedAnswers: null,
        points: "1.00",
        position: 2,
      },
      {
        id: questionIds.membraneEnergy,
        quizId: ids.membraneQuiz,
        type: "short_answer",
        prompt: "Molekul energi apa yang digunakan dalam transport aktif?",
        explanation: "ATP menyediakan energi untuk memindahkan zat melawan gradien konsentrasi.",
        acceptedAnswers: ["ATP", "adenosin trifosfat"],
        points: "1.00",
        position: 3,
      },
      {
        id: questionIds.membraneHypertonic,
        quizId: ids.membraneQuiz,
        type: "multiple_choice",
        prompt: "Apa yang terjadi pada sel hewan di dalam larutan hipertonik?",
        explanation: "Air keluar dari sel menuju larutan yang lebih pekat sehingga sel mengerut.",
        acceptedAnswers: null,
        points: "1.00",
        position: 4,
      },
      {
        id: questionIds.membraneChannel,
        quizId: ids.membraneQuiz,
        type: "short_answer",
        prompt: "Protein membran apa yang membentuk jalur hidrofilik bagi ion tertentu?",
        explanation: "Protein kanal membentuk pori selektif yang membantu ion melewati membran.",
        acceptedAnswers: ["protein kanal", "kanal protein"],
        points: "1.00",
        position: 5,
      },
    ];
    await transaction
      .insert(quizQuestion)
      .values(questions)
      .onConflictDoUpdate({
        target: quizQuestion.id,
        set: {
          type: sql`excluded.type`,
          prompt: sql`excluded.prompt`,
          explanation: sql`excluded.explanation`,
          acceptedAnswers: sql`excluded.accepted_answers`,
          points: sql`excluded.points`,
          position: sql`excluded.position`,
          updatedAt: now,
        },
      });

    const optionSets = [
      [questionIds.bahasaClaim, ["Bukti", "Klaim", "Contoh", "Kutipan"], 1],
      [questionIds.bahasaVerify, ["Langsung menggunakannya", "Menghapus semua argumen", "Memverifikasi ke sumber asli", "Mengganti angkanya"], 2],
      [questionIds.sourcePrimary, ["Komentar media sosial", "Dokumen kebijakan asli", "Artikel opini", "Ringkasan blog"], 1],
      [questionIds.sourceFact, ["Asumsi", "Opini", "Fakta", "Imbauan"], 2],
      [questionIds.sourceRecency, ["Agar judul terlihat menarik", "Untuk menilai relevansi informasi", "Agar sumber menjadi primer", "Untuk mengganti nama penulis"], 1],
      [questionIds.biologyMitochondria, ["Ribosom", "Mitokondria", "Lisosom", "Nukleus"], 1],
      [questionIds.biologyOsmosis, ["Difusi", "Osmosis", "Endositosis", "Transkripsi"], 1],
      [questionIds.biologyPlantCell, ["Membran sel", "Ribosom", "Dinding sel", "Sitoplasma"], 2],
      [questionIds.membranePassive, ["Transport aktif", "Transport pasif", "Endositosis", "Eksositosis"], 1],
      [questionIds.membraneHypertonic, ["Sel membengkak", "Sel membelah", "Sel mengerut", "Sel tidak berubah"], 2],
    ] as const;
    const options = optionSets.flatMap(([questionId, labels, correctIndex]) =>
      labels.map((label, index) => ({
        id: id(`option:${questionId}:${index + 1}`),
        questionId,
        label,
        isCorrect: index === correctIndex,
        position: index + 1,
      })),
    );
    await transaction
      .insert(quizOption)
      .values(options)
      .onConflictDoUpdate({
        target: quizOption.id,
        set: {
          label: sql`excluded.label`,
          isCorrect: sql`excluded.is_correct`,
          position: sql`excluded.position`,
          updatedAt: now,
        },
      });

    await transaction
      .insert(quizAttempt)
      .values({
        id: ids.bahasaAttempt,
        quizId: ids.bahasaQuiz,
        studentCourseMembershipId: ids.bahasaStudentCourse,
        attemptNumber: 1,
        status: "submitted",
        score: "100.00",
        startedAt: daysFromNow(-27),
        submittedAt: daysFromNow(-27),
      })
      .onConflictDoUpdate({ target: quizAttempt.id, set: { updatedAt: now } });
    const bahasaQuestions = [
      { id: questionIds.bahasaClaim, points: "1.00", position: 1 },
      { id: questionIds.bahasaVerify, points: "1.00", position: 2 },
    ];
    await transaction
      .insert(quizAnswer)
      .values(
        bahasaQuestions.map((question) => {
          const correctOption = options.find(
            (option) => option.questionId === question.id && option.isCorrect,
          );
          if (!correctOption) throw new Error("Seed quiz tidak memiliki jawaban benar.");
          return {
            id: id(`answer:bahasa:${student.id}:${question.position}`),
            attemptId: ids.bahasaAttempt,
            questionId: question.id,
            selectedOptionId: correctOption.id,
            isCorrect: true,
            awardedPoints: question.points,
          };
        }),
      )
      .onConflictDoUpdate({ target: quizAnswer.id, set: { updatedAt: now } });
  });

  return { student, schoolName: "SMA Nalar Nusantara", courseCount: 2 };
}

try {
  const result = await seed();
  console.log(`Seed selesai untuk ${result.student.name} <${result.student.email}>.`);
  console.log(`${result.courseCount} course terhubung di ${result.schoolName}.`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Seed gagal dijalankan.");
  process.exit(1);
}
