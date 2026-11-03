// The labs a teacher can attach to a lesson (PRD §5.10). Each one is built by
// the Bernalar team in nalar-fe (app/features/labs); the keys and challenge ids
// here must match that registry, and nothing else about a lab lives on the server.
export const LAB_CATALOG = [
  {
    key: "bidang-miring",
    title: "Bidang miring",
    subject: "Fisika",
    challenges: ["mulai-meluncur", "pilih-permukaan", "percepatan-dua"],
  },
  {
    key: "gerak-parabola",
    title: "Gerak parabola",
    subject: "Fisika",
    challenges: ["kenai-benteng", "dua-sudut", "berat-ringan"],
  },
  {
    key: "mesin-gelombang",
    title: "Mesin gelombang",
    subject: "Matematika",
    challenges: ["dua-sudut-setengah", "periode-dua-kali", "tiru-gelombang"],
  },
  {
    key: "reaktor-tumbukan",
    title: "Reaktor tumbukan",
    subject: "Kimia",
    challenges: ["gandakan-suhu", "katalis-tetap", "cepat-tapi-aman"],
  },
  {
    key: "mikroskop-osmosis",
    title: "Mikroskop osmosis",
    subject: "Biologi",
    challenges: ["air-ke-mana", "cari-isotonis", "plasmolisis"],
  },
] as const;

export type LabKey = (typeof LAB_CATALOG)[number]["key"];

// Small on purpose: a lab is for understanding, and each challenge counts once.
export const LAB_CHALLENGE_POINTS = 5;

export const findLab = (key: string) => LAB_CATALOG.find((lab) => lab.key === key) ?? null;
