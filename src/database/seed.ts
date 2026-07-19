import { createHash } from "node:crypto";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

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
  quizOption,
  quizQuestion,
  rubric,
  rubricCriterion,
  scenario,
  school,
  schoolMemberRole,
  schoolMembership,
  studentProfile,
  subject,
  user,
} from "./schema";

const DAY = 24 * 60 * 60 * 1_000;
const latex = String.raw;

type MultipleChoiceSeed = {
  type: "multiple_choice";
  prompt: string;
  explanation: string;
  options: string[];
  correctIndex: number;
};

type ShortAnswerSeed = {
  type: "short_answer";
  prompt: string;
  explanation: string;
  acceptedAnswers: string[];
};

type QuizQuestionSeed = MultipleChoiceSeed | ShortAnswerSeed;

function multipleChoice(
  prompt: string,
  options: string[],
  correctIndex: number,
  explanation: string,
): MultipleChoiceSeed {
  return { type: "multiple_choice", prompt, explanation, options, correctIndex };
}

function shortAnswer(
  prompt: string,
  acceptedAnswers: string[],
  explanation: string,
): ShortAnswerSeed {
  return { type: "short_answer", prompt, explanation, acceptedAnswers };
}

const algebraQuestions: QuizQuestionSeed[] = [
  multipleChoice(
    latex`Sederhanakan \(\displaystyle \frac{(2x^3y^{-2})^2}{4x^{-1}y}\), dengan \(x,y\neq 0\).`,
    [latex`\(\displaystyle \frac{x^7}{y^5}\)`, latex`\(\displaystyle \frac{x^5}{y^3}\)`, latex`\(x^7y^5\)`, latex`\(\displaystyle \frac{x^6}{y^4}\)`],
    0,
    latex`Aturan pangkat memberi \(x^{6-(-1)}=x^7\) dan \(y^{-4-1}=y^{-5}\), sehingga hasilnya \(\frac{x^7}{y^5}\).`,
  ),
  multipleChoice(
    latex`Tentukan solusi real dari \(\sqrt{x+5}=x-1\).`,
    [latex`\(x=-1\)`, latex`\(x=1\)`, latex`\(x=4\)`, latex`\(x\in\{-1,4\}\)`],
    2,
    latex`Setelah dikuadratkan diperoleh \(x^2-3x-4=0\). Kandidatnya \(-1\) dan \(4\), tetapi syarat \(x-1\ge 0\) menyisakan \(x=4\).`,
  ),
  multipleChoice(
    latex`Diskriminan persamaan \(2x^2-4x+5=0\) adalah ...`,
    [latex`\(-24\)`, latex`\(-8\)`, latex`\(16\)`, latex`\(56\)`],
    0,
    latex`\(D=b^2-4ac=(-4)^2-4(2)(5)=16-40=-24\).`,
  ),
  multipleChoice(
    latex`Jika \(\alpha\) dan \(\beta\) akar-akar \(3x^2-7x+2=0\), nilai \(\alpha^2+\beta^2\) adalah ...`,
    [latex`\(\frac{25}{9}\)`, latex`\(\frac{37}{9}\)`, latex`\(\frac{49}{9}\)`, latex`\(\frac{53}{9}\)`],
    1,
    latex`Gunakan \((\alpha+\beta)^2-2\alpha\beta=(\frac73)^2-2(\frac23)=\frac{37}{9}\).`,
  ),
  multipleChoice(
    latex`Diketahui \(f(x)=\frac{3x-2}{5}\). Bentuk \(f^{-1}(x)\) adalah ...`,
    [latex`\(\frac{5x-2}{3}\)`, latex`\(\frac{5x+2}{3}\)`, latex`\(\frac{3x+2}{5}\)`, latex`\(\frac{5}{3x-2}\)`],
    1,
    latex`Dari \(y=\frac{3x-2}{5}\) diperoleh \(x=\frac{5y+2}{3}\), lalu tukar variabelnya.`,
  ),
  multipleChoice(
    latex`Jika \(f(x)=2x-1\) dan \(g(x)=x^2+3\), maka \((f\circ g)(x)=\ldots\)`,
    [latex`\(2x^2+2\)`, latex`\(2x^2+5\)`, latex`\(4x^2+2\)`, latex`\((2x-1)^2+3\)`],
    1,
    latex`Substitusikan \(g(x)\) ke \(f\): \(f(g(x))=2(x^2+3)-1=2x^2+5\).`,
  ),
  multipleChoice(
    latex`Domain fungsi \(h(x)=\frac{\sqrt{2x-1}}{x-3}\) adalah ...`,
    [latex`\(x>\frac12\)`, latex`\(x\ge\frac12\)`, latex`\([\frac12,3)\cup(3,\infty)\)`, latex`\((3,\infty)\)`],
    2,
    latex`Akar mensyaratkan \(x\ge\frac12\), sedangkan penyebut mensyaratkan \(x\ne3\).`,
  ),
  multipleChoice(
    latex`Pada barisan aritmetika diketahui \(U_3=11\) dan \(U_8=31\). Nilai \(U_{20}\) adalah ...`,
    [latex`\(71\)`, latex`\(75\)`, latex`\(79\)`, latex`\(83\)`],
    2,
    latex`Selisih lima suku adalah \(20\), sehingga \(d=4\) dan \(a=3\). Jadi \(U_{20}=3+19(4)=79\).`,
  ),
  multipleChoice(
    latex`Jumlah delapan suku pertama deret geometri \(3+6+12+\cdots\) adalah ...`,
    [latex`\(381\)`, latex`\(510\)`, latex`\(765\)`, latex`\(768\)`],
    2,
    latex`\(S_8=3\frac{2^8-1}{2-1}=3(255)=765\).`,
  ),
  multipleChoice(
    latex`Nilai \(x\) yang memenuhi \(9^{x-1}=27^{2x+1}\) adalah ...`,
    [latex`\(-\frac54\)`, latex`\(-\frac45\)`, latex`\(\frac45\)`, latex`\(\frac54\)`],
    0,
    latex`Samakan basis menjadi \(3\): \(2x-2=6x+3\), sehingga \(x=-\frac54\).`,
  ),
  multipleChoice(
    latex`Solusi \(\log_2(x-1)+\log_2(x-3)=3\) adalah ...`,
    [latex`\(x=-1\)`, latex`\(x=4\)`, latex`\(x=5\)`, latex`\(x\in\{-1,5\}\)`],
    2,
    latex`Domainnya \(x>3\). Persamaan menjadi \((x-1)(x-3)=8\), dengan kandidat \(-1\) dan \(5\); hanya \(5\) valid.`,
  ),
  multipleChoice(
    latex`Nilai determinan \(\begin{pmatrix}2&-1\\3&4\end{pmatrix}\) adalah ...`,
    [latex`\(5\)`, latex`\(8\)`, latex`\(11\)`, latex`\(14\)`],
    2,
    latex`Determinan matriks \(2\times2\) adalah \(ad-bc=2(4)-(-1)(3)=11\).`,
  ),
  multipleChoice(
    latex`Jika \(A=\begin{pmatrix}1&2\\-1&3\end{pmatrix}\) dan \(B=\begin{pmatrix}2&0\\1&4\end{pmatrix}\), elemen baris pertama kolom pertama dari \(AB\) adalah ...`,
    [latex`\(2\)`, latex`\(4\)`, latex`\(6\)`, latex`\(10\)`],
    1,
    latex`Kalikan baris pertama \(A\) dengan kolom pertama \(B\): \(1(2)+2(1)=4\).`,
  ),
  multipleChoice(
    latex`Sistem \(\begin{cases}2x+y=7\\x-y=2\end{cases}\) memiliki nilai \(x+y=\ldots\)`,
    [latex`\(2\)`, latex`\(3\)`, latex`\(4\)`, latex`\(5\)`],
    2,
    latex`Penjumlahan kedua persamaan memberi \(3x=9\), sehingga \(x=3\), \(y=1\), dan \(x+y=4\).`,
  ),
  multipleChoice(
    latex`Titik puncak parabola \(y=-2x^2+8x-3\) adalah ...`,
    [latex`\((-2,-27)\)`, latex`\((2,5)\)`, latex`\((2,13)\)`, latex`\((4,-3)\)`],
    1,
    latex`Koordinat \(x\) puncak adalah \(-\frac{b}{2a}=2\), dan substitusi memberi \(y=5\).`,
  ),
  multipleChoice(
    latex`Sisa pembagian \(P(x)=x^3-4x+1\) oleh \(x-2\) adalah ...`,
    [latex`\(-1\)`, latex`\(0\)`, latex`\(1\)`, latex`\(5\)`],
    2,
    latex`Teorema sisa memberi \(P(2)=8-8+1=1\).`,
  ),
  multipleChoice(
    latex`Agar \(x+1\) menjadi faktor dari \(x^3+kx^2-4x-4\), nilai \(k\) adalah ...`,
    [latex`\(-1\)`, latex`\(0\)`, latex`\(1\)`, latex`\(4\)`],
    2,
    latex`Substitusi \(x=-1\) menghasilkan \(-1+k+4-4=k-1\). Agar nol, \(k=1\).`,
  ),
  multipleChoice(
    latex`Modulus bilangan kompleks \(z=3-4i\) adalah ...`,
    [latex`\(1\)`, latex`\(5\)`, latex`\(7\)`, latex`\(25\)`],
    1,
    latex`\(|z|=\sqrt{3^2+(-4)^2}=5\).`,
  ),
  shortAnswer(
    latex`Tentukan \(x\) pada persamaan \(2^{x+1}=64\). Tuliskan hanya nilainya.`,
    ["5", "x=5", "x = 5"],
    latex`Karena \(64=2^6\), maka \(x+1=6\) dan \(x=5\).`,
  ),
  shortAnswer(
    latex`Jika \(\det\begin{pmatrix}x&2\\3&4\end{pmatrix}=10\), tentukan nilai \(x\).`,
    ["4", "x=4", "x = 4"],
    latex`Persamaan determinannya \(4x-6=10\), sehingga \(x=4\).`,
  ),
];

const calculusQuestions: QuizQuestionSeed[] = [
  multipleChoice(
    latex`Nilai \(\displaystyle\lim_{x\to3}\frac{x^2-9}{x-3}\) adalah ...`,
    [latex`\(0\)`, latex`\(3\)`, latex`\(6\)`, latex`\(9\)`],
    2,
    latex`Faktorkan pembilang menjadi \((x-3)(x+3)\), lalu substitusikan \(x=3\) ke \(x+3\).`,
  ),
  multipleChoice(
    latex`Nilai \(\displaystyle\lim_{x\to0}\frac{\sin(5x)}{2x}\) adalah ...`,
    [latex`\(\frac25\)`, latex`\(1\)`, latex`\(\frac52\)`, latex`\(5\)`],
    2,
    latex`Gunakan \(\lim_{u\to0}\frac{\sin u}{u}=1\): hasilnya \(\frac52\).`,
  ),
  multipleChoice(
    latex`Turunan pertama dari \(f(x)=x^4-3x^2+2x-7\) adalah ...`,
    [latex`\(4x^3-6x+2\)`, latex`\(4x^3-3x+2\)`, latex`\(x^3-6x+2\)`, latex`\(4x^3-6x-7\)`],
    0,
    latex`Terapkan aturan pangkat pada setiap suku: \(f'(x)=4x^3-6x+2\).`,
  ),
  multipleChoice(
    latex`Jika \(h(x)=(x^2+1)e^x\), maka \(h'(x)=\ldots\)`,
    [latex`\(2xe^x\)`, latex`\((x^2+1)e^x\)`, latex`\(e^x(x+1)^2\)`, latex`\(e^x(x^2+2)\)`],
    2,
    latex`Aturan hasil kali memberi \(2xe^x+(x^2+1)e^x=e^x(x+1)^2\).`,
  ),
  multipleChoice(
    latex`Gradien garis singgung kurva \(y=x^3-2x\) pada \(x=2\) adalah ...`,
    [latex`\(6\)`, latex`\(8\)`, latex`\(10\)`, latex`\(12\)`],
    2,
    latex`\(y'=3x^2-2\), sehingga \(y'(2)=12-2=10\).`,
  ),
  multipleChoice(
    latex`Hasil \(\displaystyle\int(6x^2-4x+3)\,dx\) adalah ...`,
    [latex`\(2x^3-2x^2+3x+C\)`, latex`\(6x^3-4x^2+3x+C\)`, latex`\(2x^3-4x^2+3+C\)`, latex`\(12x-4+C\)`],
    0,
    latex`Integralkan per suku untuk memperoleh \(2x^3-2x^2+3x+C\).`,
  ),
  multipleChoice(
    latex`Nilai \(\displaystyle\int_0^2(3x^2+1)\,dx\) adalah ...`,
    [latex`\(6\)`, latex`\(8\)`, latex`\(10\)`, latex`\(12\)`],
    2,
    latex`Antiturunannya \(x^3+x\). Evaluasi pada batas memberi \((8+2)-0=10\).`,
  ),
  multipleChoice(
    latex`Luas daerah di bawah \(y=4-x^2\) dan di atas sumbu-\(x\) adalah ...`,
    [latex`\(\frac{16}{3}\)`, latex`\(8\)`, latex`\(\frac{32}{3}\)`, latex`\(16\)`],
    2,
    latex`Akar kurva berada di \(x=\pm2\). Maka luasnya \(\int_{-2}^{2}(4-x^2)dx=\frac{32}{3}\).`,
  ),
  multipleChoice(
    latex`Bentuk yang ekuivalen dengan \(\frac{1-\cos(2x)}{2}\) adalah ...`,
    [latex`\(\cos^2x\)`, latex`\(\sin^2x\)`, latex`\(\tan^2x\)`, latex`\(2\sin x\cos x\)`],
    1,
    latex`Identitas sudut ganda menyatakan \(\cos(2x)=1-2\sin^2x\).`,
  ),
  multipleChoice(
    latex`Nilai tepat \(\sin75^\circ\) adalah ...`,
    [latex`\(\frac{\sqrt6-\sqrt2}{4}\)`, latex`\(\frac{\sqrt6+\sqrt2}{4}\)`, latex`\(\frac{\sqrt3+1}{2}\)`, latex`\(\frac{\sqrt2}{2}\)`],
    1,
    latex`Gunakan \(\sin(45^\circ+30^\circ)\) untuk memperoleh \(\frac{\sqrt6+\sqrt2}{4}\).`,
  ),
  multipleChoice(
    latex`Banyak solusi \(2\sin x\cos x=1\) pada interval \(0\le x\le2\pi\) adalah ...`,
    [latex`\(1\)`, latex`\(2\)`, latex`\(3\)`, latex`\(4\)`],
    3,
    latex`Persamaan menjadi \(\sin2x=1\), yang menghasilkan empat nilai \(x\) pada interval tersebut.`,
  ),
  multipleChoice(
    latex`Banyak cara memilih 3 siswa dari 8 siswa adalah ...`,
    [latex`\(24\)`, latex`\(48\)`, latex`\(56\)`, latex`\(336\)`],
    2,
    latex`Urutan tidak diperhatikan, sehingga gunakan \(\binom83=56\).`,
  ),
  multipleChoice(
    latex`Dua dadu adil dilempar bersamaan. Peluang jumlah mata dadu sama dengan 8 adalah ...`,
    [latex`\(\frac1{12}\)`, latex`\(\frac5{36}\)`, latex`\(\frac16\)`, latex`\(\frac7{36}\)`],
    1,
    latex`Ada lima pasangan berjumlah 8 dari 36 pasangan yang sama mungkin.`,
  ),
  multipleChoice(
    latex`Diketahui \(P(A)=0{,}6\), \(P(B)=0{,}5\), dan \(P(A\cap B)=0{,}3\). Nilai \(P(A\mid B)\) adalah ...`,
    [latex`\(0{,}3\)`, latex`\(0{,}5\)`, latex`\(0{,}6\)`, latex`\(0{,}8\)`],
    2,
    latex`\(P(A\mid B)=\frac{P(A\cap B)}{P(B)}=\frac{0{,}3}{0{,}5}=0{,}6\).`,
  ),
  multipleChoice(
    latex`Jika \(X\sim\operatorname{Bin}(5,0{,}2)\), maka \(P(X=1)\) adalah ...`,
    [latex`\(0{,}2048\)`, latex`\(0{,}32768\)`, latex`\(0{,}4096\)`, latex`\(0{,}67232\)`],
    2,
    latex`\(P(X=1)=\binom51(0{,}2)(0{,}8)^4=0{,}4096\).`,
  ),
  multipleChoice(
    latex`Nilai harapan mata sebuah dadu adil adalah ...`,
    [latex`\(3\)`, latex`\(\frac72\)`, latex`\(4\)`, latex`\(\frac{21}{2}\)`],
    1,
    latex`\(E(X)=\frac{1+2+3+4+5+6}{6}=\frac72\).`,
  ),
  multipleChoice(
    latex`Jika \(X\) berdistribusi Bernoulli dengan \(p=0{,}3\), varians \(X\) adalah ...`,
    [latex`\(0{,}09\)`, latex`\(0{,}21\)`, latex`\(0{,}3\)`, latex`\(0{,}7\)`],
    1,
    latex`Varians Bernoulli adalah \(p(1-p)=0{,}3(0{,}7)=0{,}21\).`,
  ),
  shortAnswer(
    latex`Jika \(f(x)=\ln x+x^2\), tentukan nilai \(f'(1)\).`,
    ["3", "f'(1)=3", "f'(1) = 3"],
    latex`\(f'(x)=\frac1x+2x\), sehingga \(f'(1)=3\).`,
  ),
  shortAnswer(
    latex`Hitung \(\displaystyle\int_0^\pi\sin x\,dx\). Tuliskan hasil akhirnya.`,
    ["2"],
    latex`Antiturunannya \(-\cos x\), sehingga nilainya \(-\cos\pi+\cos0=2\).`,
  ),
  shortAnswer(
    latex`Tentukan \(\displaystyle\lim_{n\to\infty}\left(1+\frac1n\right)^n\).`,
    ["e", "bilangan e", "konstanta e"],
    latex`Limit tersebut merupakan definisi klasik bilangan Euler \(e\).`,
  ),
];

function id(key: string) {
  const bytes = createHash("sha256")
    .update(`nalar-seed:${key}`)
    .digest()
    .subarray(0, 16);
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
    throw new Error(
      "Belum ada akun terdaftar. Register terlebih dahulu sebelum menjalankan seed.",
    );
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
    teacherUser: id("user:guru-matematika-demo"),
    studentMembership: id(`membership:student:${student.id}`),
    teacherMembership: id("membership:teacher-matematika-demo"),
    year: id(`academic-year:${period.name}`),
    term: id(`academic-term:${period.name}:ganjil`),
    subject: id("subject:matematika-lanjut"),
    course: id(`course:${period.name}:matematika-lanjut-xi`),
    studentCourse: id(`course-membership:matematika:${student.id}`),
    teacherCourse: id("course-membership:matematika:teacher-demo"),
    algebraModule: id("module:matematika:aljabar-fungsi"),
    calculusModule: id("module:matematika:kalkulus"),
    probabilityModule: id("module:matematika:peluang"),
    baseRubric: id("rubric:matematika:nalar-template"),
    modelingRubric: id("rubric:matematika:pemodelan"),
    investigationRubric: id("rubric:matematika:investigasi"),
    modelingScenario: id("scenario:matematika:pemodelan"),
    investigationScenario: id("scenario:matematika:investigasi"),
    modelingAssignment: id("assignment:matematika:pemodelan"),
    investigationAssignment: id("assignment:matematika:investigasi"),
    algebraQuiz: id("quiz:matematika:aljabar-fungsi"),
    calculusQuiz: id("quiz:matematika:kalkulus-peluang"),
    legacyStudentCourses: [
      id(`course-membership:bahasa:${student.id}`),
      id(`course-membership:biologi:${student.id}`),
    ],
  } as const;

  const lessonRows = [
    {
      key: "fungsi-komposisi",
      moduleId: ids.algebraModule,
      title: "Fungsi, Komposisi, dan Invers",
      content: latex`Fungsi memetakan setiap anggota domain ke tepat satu anggota kodomain. Komposisi ditulis \((f\circ g)(x)=f(g(x))\), sedangkan fungsi invers memenuhi \(f^{-1}(f(x))=x\). Sebelum melakukan manipulasi aljabar, selalu periksa domain. Untuk fungsi rasional-akar seperti \(h(x)=\frac{\sqrt{2x-1}}{x-3}\), syaratnya adalah \(2x-1\ge0\) dan \(x\ne3\).`,
      modulePosition: 1,
      position: 1,
    },
    {
      key: "polinom-matriks",
      moduleId: ids.algebraModule,
      title: "Polinom, Matriks, dan Sistem Persamaan",
      content: latex`Teorema faktor menyatakan \((x-a)\) adalah faktor \(P(x)\) jika dan hanya jika \(P(a)=0\). Pada matriks \(A=\begin{pmatrix}a&b\\c&d\end{pmatrix}\), determinannya \(\det(A)=ad-bc\). Matriks memiliki invers tepat ketika \(\det(A)\ne0\), dengan \(A^{-1}=\frac1{ad-bc}\begin{pmatrix}d&-b\\-c&a\end{pmatrix}\).`,
      modulePosition: 1,
      position: 2,
    },
    {
      key: "limit-turunan",
      moduleId: ids.calculusModule,
      title: "Limit dan Turunan sebagai Laju Perubahan",
      content: latex`Limit menjelaskan perilaku fungsi ketika variabel mendekati suatu nilai. Turunan didefinisikan oleh \(f'(x)=\lim_{h\to0}\frac{f(x+h)-f(x)}h\). Aturan rantai untuk \(y=f(g(x))\) adalah \(\frac{dy}{dx}=f'(g(x))g'(x)\). Secara geometris, \(f'(a)\) merupakan gradien garis singgung di \(x=a\).`,
      modulePosition: 2,
      position: 1,
    },
    {
      key: "integral-aplikasi",
      moduleId: ids.calculusModule,
      title: "Integral dan Akumulasi",
      content: latex`Integral tentu mengukur akumulasi bersih: \(\int_a^b f(x)\,dx=F(b)-F(a)\) ketika \(F'(x)=f(x)\). Luas geometris perlu memperhatikan tanda fungsi, sehingga \(L=\int_a^b|f(x)|\,dx\). Untuk substitusi \(u=g(x)\), ubah pula diferensialnya menjadi \(du=g'(x)\,dx\).`,
      modulePosition: 2,
      position: 2,
    },
    {
      key: "peluang-bersyarat",
      moduleId: ids.probabilityModule,
      title: "Kombinatorika dan Peluang Bersyarat",
      content: latex`Kombinasi \(\binom nr=\frac{n!}{r!(n-r)!}\) dipakai ketika urutan tidak penting. Peluang bersyarat didefinisikan sebagai \(P(A\mid B)=\frac{P(A\cap B)}{P(B)}\). Untuk \(X\sim\operatorname{Bin}(n,p)\), \(P(X=k)=\binom nkp^k(1-p)^{n-k}\), \(E(X)=np\), dan \(\operatorname{Var}(X)=np(1-p)\).`,
      modulePosition: 3,
      position: 1,
    },
  ].map((row) => ({ ...row, id: id(`lesson:matematika:${row.key}`) }));

  await db.transaction(async (transaction) => {
    await transaction
      .insert(user)
      .values({
        id: ids.teacherUser,
        name: "Ibu Rania Prameswari",
        email: "guru.matematika@nalar.local",
        emailVerified: true,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: { name: "Ibu Rania Prameswari", emailVerified: true, updatedAt: now },
      });

    await transaction
      .insert(school)
      .values({
        id: ids.school,
        name: "SMA Nalar Nusantara",
        slug: "sma-nalar-nusantara",
      })
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
      .values({
        id: ids.subject,
        schoolId: ids.school,
        code: "MAT-L-XI",
        name: "Matematika Lanjut",
      })
      .onConflictDoUpdate({
        target: subject.id,
        set: { code: "MAT-L-XI", name: "Matematika Lanjut", updatedAt: now },
      });
    await transaction
      .insert(course)
      .values({
        id: ids.course,
        schoolId: ids.school,
        termId: ids.term,
        subjectId: ids.subject,
        name: "Matematika Lanjut XI",
        description:
          "Menalar pola, membangun model, dan memecahkan masalah aljabar, kalkulus, serta peluang.",
        status: "published",
      })
      .onConflictDoUpdate({
        target: course.id,
        set: {
          name: "Matematika Lanjut XI",
          description:
            "Menalar pola, membangun model, dan memecahkan masalah aljabar, kalkulus, serta peluang.",
          status: "published",
          updatedAt: now,
        },
      });
    await transaction
      .insert(courseMembership)
      .values([
        {
          id: ids.studentCourse,
          courseId: ids.course,
          schoolMembershipId: ids.studentMembership,
          role: "student",
          status: "active",
          activatedAt: daysFromNow(-90),
        },
        {
          id: ids.teacherCourse,
          courseId: ids.course,
          schoolMembershipId: ids.teacherMembership,
          role: "teacher",
          status: "active",
          activatedAt: daysFromNow(-120),
        },
      ])
      .onConflictDoUpdate({
        target: courseMembership.id,
        set: { status: "active", completedAt: null, updatedAt: now },
      });

    // Deactivate only enrollments owned by older demo fixtures. Never alter
    // courses that the student joined outside this seed.
    await transaction
      .update(courseMembership)
      .set({ status: "removed", updatedAt: now })
      .where(inArray(courseMembership.id, ids.legacyStudentCourses));

    await transaction
      .insert(learningModule)
      .values([
        {
          id: ids.algebraModule,
          courseId: ids.course,
          title: "Aljabar dan Fungsi",
          description: "Manipulasi simbolik, fungsi, polinom, dan matriks.",
          position: 1,
          status: "published",
          publishedAt: daysFromNow(-60),
        },
        {
          id: ids.calculusModule,
          courseId: ids.course,
          title: "Pengantar Kalkulus",
          description: "Limit, turunan, integral, dan interpretasi geometrisnya.",
          position: 2,
          status: "published",
          publishedAt: daysFromNow(-45),
        },
        {
          id: ids.probabilityModule,
          courseId: ids.course,
          title: "Peluang dan Distribusi",
          description: "Kombinatorika, peluang bersyarat, dan variabel acak.",
          position: 3,
          status: "published",
          publishedAt: daysFromNow(-30),
        },
      ])
      .onConflictDoUpdate({
        target: learningModule.id,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          position: sql`excluded.position`,
          status: "published",
          updatedAt: now,
        },
      });

    await transaction
      .insert(lesson)
      .values(
        lessonRows.map((row) => ({
          id: row.id,
          moduleId: row.moduleId,
          title: row.title,
          content: row.content,
          position: row.position,
          status: "published" as const,
          publishedAt: daysFromNow(-65 + row.modulePosition * 12 + row.position),
        })),
      )
      .onConflictDoUpdate({
        target: lesson.id,
        set: {
          title: sql`excluded.title`,
          content: sql`excluded.content`,
          position: sql`excluded.position`,
          status: "published",
          updatedAt: now,
        },
      });

    await transaction
      .insert(learningResource)
      .values(
        lessonRows.map((row) => ({
          id: id(`resource:matematika:${row.key}`),
          lessonId: row.id,
          type: "text" as const,
          title: "Ringkasan dan latihan mandiri",
          content: latex`Tuliskan apa yang diketahui, nyatakan domain atau asumsi, pilih strategi, lalu verifikasi hasil dengan substitusi atau representasi lain. Jangan hanya menyalin transformasi simbolik.`,
          position: 1,
        })),
      )
      .onConflictDoUpdate({
        target: learningResource.id,
        set: { title: sql`excluded.title`, content: sql`excluded.content`, updatedAt: now },
      });

    await transaction
      .insert(lessonProgress)
      .values(
        lessonRows.slice(0, 3).map((row, index) => ({
          id: id(`progress:matematika:${row.key}:${student.id}`),
          lessonId: row.id,
          studentCourseMembershipId: ids.studentCourse,
          status: index < 2 ? ("completed" as const) : ("in_progress" as const),
          startedAt: daysFromNow(-18 + index * 4),
          completedAt: index < 2 ? daysFromNow(-17 + index * 4) : null,
        })),
      )
      .onConflictDoUpdate({
        target: lessonProgress.id,
        set: {
          status: sql`excluded.status`,
          startedAt: sql`excluded.started_at`,
          completedAt: sql`excluded.completed_at`,
          updatedAt: now,
        },
      });

    await transaction
      .insert(courseAnnouncement)
      .values({
        id: id("announcement:matematika:semester"),
        courseId: ids.course,
        authorCourseMembershipId: ids.teacherCourse,
        title: "Fokus pada proses penalaran",
        body: "Saat mengerjakan materi, tugas, dan quiz, tuliskan asumsi serta langkah verifikasi. AI Tutor boleh membantu memberi petunjuk, tetapi keputusan matematis tetap harus kamu bangun sendiri.",
        status: "published",
        publishedAt: daysFromNow(-7),
      })
      .onConflictDoUpdate({
        target: courseAnnouncement.id,
        set: { title: sql`excluded.title`, body: sql`excluded.body`, status: "published", updatedAt: now },
      });

    const rubricRows = [
      { id: ids.baseRubric, name: "Rubrik Penalaran Matematika", isTemplate: true },
      { id: ids.modelingRubric, name: "Rubrik Pemodelan Optimasi", isTemplate: false },
      { id: ids.investigationRubric, name: "Rubrik Investigasi Peluang", isTemplate: false },
    ];
    await transaction
      .insert(rubric)
      .values(
        rubricRows.map((row) => ({
          ...row,
          schoolId: ids.school,
          lockedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: rubric.id,
        set: { name: sql`excluded.name`, lockedAt: now, updatedAt: now },
      });

    const criterionDefinitions = [
      ["Representasi masalah", "Variabel, batasan, dan informasi penting dinyatakan tepat.", "20.00"],
      ["Strategi dan penalaran", "Strategi logis, efisien, dan setiap transformasi dapat dijelaskan.", "35.00"],
      ["Ketepatan matematis", "Perhitungan, notasi, dan kesimpulan konsisten dengan model.", "30.00"],
      ["Verifikasi dan refleksi", "Hasil diperiksa dan penggunaan AI dievaluasi secara jujur.", "15.00"],
    ] as const;
    const criteria = rubricRows.flatMap((rubricRow) =>
      criterionDefinitions.map(([label, description, maxPoints], index) => ({
        id: id(`criterion:${rubricRow.id}:${index + 1}`),
        rubricId: rubricRow.id,
        label,
        description,
        maxPoints,
        position: index + 1,
      })),
    );
    await transaction
      .insert(rubricCriterion)
      .values(criteria)
      .onConflictDoUpdate({
        target: rubricCriterion.id,
        set: {
          label: sql`excluded.label`,
          description: sql`excluded.description`,
          maxPoints: sql`excluded.max_points`,
          updatedAt: now,
        },
      });

    await transaction
      .insert(scenario)
      .values([
        {
          id: ids.modelingScenario,
          schoolId: ids.school,
          subjectId: ids.subject,
          title: "Optimasi Desain Taman Sekolah",
          instructions: latex`Bangun model fungsi luas dan tentukan ukuran optimum dengan aljabar atau turunan. Jelaskan domain model serta periksa apakah solusi masuk akal secara kontekstual.`,
          defaultRubricId: ids.baseRubric,
        },
        {
          id: ids.investigationScenario,
          schoolId: ids.school,
          subjectId: ids.subject,
          title: "Investigasi Peluang pada Tes Diagnostik",
          instructions: latex`Analisis model binomial untuk tes dengan 10 butir. Bandingkan \(P(X\ge7)\) pada dua nilai peluang keberhasilan dan interpretasikan perbedaannya.`,
          defaultRubricId: ids.baseRubric,
        },
      ])
      .onConflictDoUpdate({
        target: scenario.id,
        set: {
          title: sql`excluded.title`,
          instructions: sql`excluded.instructions`,
          isActive: true,
          updatedAt: now,
        },
      });

    await transaction
      .insert(assignment)
      .values([
        {
          id: ids.modelingAssignment,
          courseId: ids.course,
          moduleId: ids.calculusModule,
          scenarioId: ids.modelingScenario,
          rubricId: ids.modelingRubric,
          createdByCourseMembershipId: ids.teacherCourse,
          title: "Pemodelan Optimasi Taman",
          instructions: latex`Sebuah taman berbentuk persegi panjang menempel pada dinding sehingga hanya tiga sisinya dipagari dengan total pagar \(80\,\text{m}\). Bentuk fungsi luas \(A(x)\), tentukan \(\max A(x)\), jelaskan domain, dan verifikasi solusi menggunakan turunan serta satu cara lain.`,
          status: "published",
          availableAt: daysFromNow(-2),
          dueAt: daysFromNow(7),
          closesAt: daysFromNow(10),
          maxAttempts: 2,
          publishedAt: daysFromNow(-3),
        },
        {
          id: ids.investigationAssignment,
          courseId: ids.course,
          moduleId: ids.probabilityModule,
          scenarioId: ids.investigationScenario,
          rubricId: ids.investigationRubric,
          createdByCourseMembershipId: ids.teacherCourse,
          title: "Investigasi Distribusi Binomial",
          instructions: latex`Untuk \(X\sim\operatorname{Bin}(10,p)\), hitung dan bandingkan \(P(X\ge7)\) ketika \(p=0{,}6\) dan \(p=0{,}8\). Tunjukkan bentuk \(\sum_{k=7}^{10}\binom{10}{k}p^k(1-p)^{10-k}\), interpretasikan hasil, dan tulis refleksi penggunaan AI.`,
          status: "published",
          availableAt: daysFromNow(1),
          dueAt: daysFromNow(14),
          closesAt: daysFromNow(17),
          maxAttempts: 2,
          publishedAt: daysFromNow(-1),
        },
      ])
      .onConflictDoUpdate({
        target: assignment.id,
        set: {
          title: sql`excluded.title`,
          instructions: sql`excluded.instructions`,
          status: sql`excluded.status`,
          availableAt: sql`excluded.available_at`,
          dueAt: sql`excluded.due_at`,
          closesAt: sql`excluded.closes_at`,
          maxAttempts: sql`excluded.max_attempts`,
          publishedAt: sql`excluded.published_at`,
          updatedAt: now,
        },
      });

    const quizRows = [
      {
        id: ids.algebraQuiz,
        moduleId: ids.algebraModule,
        title: "Quiz Aljabar dan Fungsi",
        instructions: "Kerjakan 20 soal secara berurutan. Tulis jawaban isian tanpa uraian tambahan.",
        timeLimitMinutes: 60,
        dueInDays: 8,
      },
      {
        id: ids.calculusQuiz,
        moduleId: ids.calculusModule,
        title: "Quiz Kalkulus dan Peluang",
        instructions: "Kerjakan 20 soal. Gunakan notasi matematika yang tepat pada soal isian.",
        timeLimitMinutes: 60,
        dueInDays: 15,
      },
    ] as const;
    await transaction
      .insert(quiz)
      .values(
        quizRows.map((row) => ({
          id: row.id,
          courseId: ids.course,
          moduleId: row.moduleId,
          createdByCourseMembershipId: ids.teacherCourse,
          title: row.title,
          instructions: row.instructions,
          status: "published" as const,
          availableAt: daysFromNow(-1),
          dueAt: daysFromNow(row.dueInDays),
          closesAt: daysFromNow(row.dueInDays + 3),
          timeLimitMinutes: row.timeLimitMinutes,
          publishedAt: daysFromNow(-2),
        })),
      )
      .onConflictDoUpdate({
        target: quiz.id,
        set: {
          title: sql`excluded.title`,
          instructions: sql`excluded.instructions`,
          status: "published",
          availableAt: sql`excluded.available_at`,
          dueAt: sql`excluded.due_at`,
          closesAt: sql`excluded.closes_at`,
          timeLimitMinutes: sql`excluded.time_limit_minutes`,
          publishedAt: sql`excluded.published_at`,
          updatedAt: now,
        },
      });

    const quizDefinitions = [
      { quizId: ids.algebraQuiz, key: "algebra", questions: algebraQuestions },
      { quizId: ids.calculusQuiz, key: "calculus", questions: calculusQuestions },
    ] as const;
    const questions: Array<typeof quizQuestion.$inferInsert> = [];
    const options: Array<typeof quizOption.$inferInsert> = [];
    for (const definition of quizDefinitions) {
      definition.questions.forEach((question, index) => {
        const position = index + 1;
        const questionId = id(`question:matematika:${definition.key}:${position}`);
        questions.push({
          id: questionId,
          quizId: definition.quizId,
          type: question.type,
          prompt: question.prompt,
          explanation: question.explanation,
          acceptedAnswers:
            question.type === "short_answer" ? question.acceptedAnswers : null,
          points: "5.00",
          position,
        });
        if (question.type === "multiple_choice") {
          question.options.forEach((label, optionIndex) => {
            options.push({
              id: id(`option:${questionId}:${optionIndex + 1}`),
              questionId,
              label,
              isCorrect: optionIndex === question.correctIndex,
              position: optionIndex + 1,
            });
          });
        }
      });
    }
    if (questions.length !== 40) {
      throw new Error("Seed quiz harus menghasilkan tepat 40 soal.");
    }
    if (quizDefinitions.some((definition) => definition.questions.length !== 20)) {
      throw new Error("Setiap quiz seed harus memiliki tepat 20 soal.");
    }

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
  });

  return {
    student,
    schoolName: "SMA Nalar Nusantara",
    courseCount: 1,
    lessonCount: lessonRows.length,
    assignmentCount: 2,
    quizCount: 2,
    questionCount: algebraQuestions.length + calculusQuestions.length,
  };
}

try {
  const result = await seed();
  console.log(`Seed selesai untuk ${result.student.name} <${result.student.email}>.`);
  console.log(
    `${result.courseCount} course, ${result.lessonCount} materi, ${result.assignmentCount} assignment, dan ${result.quizCount} quiz (${result.questionCount} soal) tersedia di ${result.schoolName}.`,
  );
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Seed gagal dijalankan.");
  process.exit(1);
}
