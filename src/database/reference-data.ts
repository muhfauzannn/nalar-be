// Subjects a course creator can pick from. Mirrors the INSERT in
// drizzle/0005_school_removal.sql; seed.ts re-applies it (idempotently) so the
// list also survives `db:reset`.
export const referenceSubjects: Array<{ code: string; name: string }> = [
  { code: "BIN", name: "Bahasa Indonesia" },
  { code: "BING", name: "Bahasa Inggris" },
  { code: "MAT", name: "Matematika" },
  { code: "FIS", name: "Fisika" },
  { code: "KIM", name: "Kimia" },
  { code: "BIO", name: "Biologi" },
  { code: "SEJ", name: "Sejarah" },
  { code: "GEO", name: "Geografi" },
  { code: "EKO", name: "Ekonomi" },
  { code: "SOS", name: "Sosiologi" },
  { code: "INF", name: "Informatika" },
  { code: "PKN", name: "Pendidikan Pancasila dan Kewarganegaraan" },
  { code: "SBD", name: "Seni Budaya" },
  { code: "PJOK", name: "Pendidikan Jasmani, Olahraga, dan Kesehatan" },
  { code: "AGM", name: "Pendidikan Agama dan Budi Pekerti" },
  { code: "LNY", name: "Lainnya" },
];
