import type { LabKey } from "../labs/lab-catalog";

// What the AI Tutor knows about each lab: the machine on the screen, the idea it
// shows, and each mission with the settings that solve it. The solutions are for
// the tutor to steer by and must never be said to the student. Keep in step with
// the lab models in nalar-fe/app/features/labs/*/model.ts.

export type LabTutorBrief = {
  machine: string;
  concept: string;
  missions: Record<string, { goal: string; solution: string; misconception: string }>;
};

export const LAB_TUTOR_BRIEFS: Record<LabKey, LabTutorBrief> = {
  "gerak-parabola": {
    machine:
      "Meriam di atas tebing setinggi 6 m menembakkan bola ke lapangan sepanjang 40 m. Siswa mengatur sudut laras (10°–80°) dan takaran mesiu (kecepatan awal 8–22 m/s), memilih bola 1 kg atau 5 kg, lalu menembak. Sebuah kereta kecil berjalan tepat di bawah bola. Tanpa hambatan udara, g = 9,8 m/s².",
    concept: "Gerak parabola: kecepatan mendatar tetap, kecepatan tegak berkurang g tiap detik, massa tidak memengaruhi lintasan.",
    missions: {
      "kenai-benteng": {
        goal: "Kenai bendera 30 m dari tebing (toleransi 1 m).",
        solution: "Misalnya sudut 25° dengan 16 m/s; banyak pasangan lain juga bisa.",
        misconception: "Mengira hanya sudut 45° yang paling jauh di sini, padahal bola dilepas dari tebing tinggi.",
      },
      "dua-sudut": {
        goal: "Kenai bendera 24 m dua kali dengan dua sudut yang berbeda minimal 15°.",
        solution: "Misalnya kecepatan 14 m/s dengan sudut 22° dan 50°.",
        misconception: "Mengira satu kecepatan hanya punya satu sudut yang tepat.",
      },
      "berat-ringan": {
        goal: "Sudut 40° dan kecepatan 16 m/s dikunci; siswa menebak dulu bola 5 kg atau 1 kg yang lebih jauh, lalu menembak keduanya.",
        solution: "Keduanya jatuh di jarak yang sama (sekitar 33 m).",
        misconception: "Mengira bola berat jatuh lebih cepat atau terbang lebih jauh.",
      },
    },
  },
  "mesin-gelombang": {
    machine:
      "Engkol memutar roda lewat sabuk dengan roda gigi 1× atau 2×. Sebuah pasak di roda berjarak A (0,5–2) dari poros; pena di papan grafik selalu setinggi pasak, sehingga memutar engkol menggambar y = A·sin(b·θ) terhadap sudut engkol θ (0°–360°). Siswa bisa menandai titik pada grafik.",
    concept: "Fungsi sinus sebagai tinggi titik pada lingkaran; amplitudo A dan periode 360°/b.",
    missions: {
      "dua-sudut-setengah": {
        goal: "Dengan A = 1 dan roda gigi 1×, tandai SEMUA sudut saat pena tepat di y = 0,5.",
        solution: "30° dan 150°.",
        misconception: "Hanya menemukan 30°, atau mengira sudut kedua 210°.",
      },
      "periode-dua-kali": {
        goal: "Dengan roda gigi 2×, tandai putaran engkol terkecil saat gelombang mulai berulang.",
        solution: "180° (π).",
        misconception: "Mengira periode menjadi 720° karena dikali 2.",
      },
      "tiru-gelombang": {
        goal: "Tiru gelombang ungu dengan mengatur jarak pasak dan roda gigi, lalu putar penuh.",
        solution: "A = 1,5 dengan roda gigi 2×.",
        misconception: "Mengubah roda gigi saat yang perlu diubah tinggi puncak, atau sebaliknya.",
      },
    },
  },
  "reaktor-tumbukan": {
    machine:
      "Reaktor kaca berisi partikel A (merah) dan B (biru) di atas pemanas. Siswa memutar kenop pemanas (290–340 K), menekan pompa suntik untuk konsentrasi (0,5–2,0 M), dan mencelupkan keranjang katalis. Kilatan kuning adalah tumbukan yang berhasil, cincin abu-abu tumbukan yang memantul. Pengukur menunjukkan laju dibanding campuran awal (300 K, 1,0 M, tanpa katalis). Ea = 53,6 kJ/mol, dengan katalis 48,4 kJ/mol; laju ∝ k·[A].",
    concept: "Teori tumbukan dan laju reaksi: suhu menambah bagian tumbukan yang energinya ≥ Ea, konsentrasi menambah jumlah tumbukan, katalis menurunkan Ea dan tidak habis.",
    missions: {
      "gandakan-suhu": {
        goal: "Buat laju 2× hanya dengan pemanas (konsentrasi 1,0 M dan tanpa katalis dikunci).",
        solution: "310 K.",
        misconception: "Mengira suhu harus dinaikkan dua kali lipat (600 K) agar laju dua kali.",
      },
      "katalis-tetap": {
        goal: "Menebak dulu apakah katalis 2,0 g habis atau tetap, lalu mereaksikan.",
        solution: "Katalis tetap 2,0 g.",
        misconception: "Mengira katalis ikut habis seperti pereaksi.",
      },
      "cepat-tapi-aman": {
        goal: "Capai laju 12× atau lebih tanpa melewati 310 K.",
        solution: "Pakai katalis, lalu 310 K pada 1,0 M (15×) atau 300 K pada 1,5 M (12×).",
        misconception: "Terus menaikkan suhu, padahal tanpa katalis paling tinggi hanya 4×.",
      },
    },
  },
  "mikroskop-osmosis": {
    machine:
      "Mikroskop dengan pipet berskala 0–3 % NaCl. Siswa menggeser cincin pipet, meneteskan larutan ke kaca preparat, lalu mengamati sel di lensa: panah biru adalah arah air, titik kuning adalah garam. Sel darah merah isotonis dengan 0,9 %, pecah bila volumenya ≥ 160 %, mengkerut di bawah 90 %. Sel bawang merah isotonis sekitar 1,0 %; dindingnya menahan sel agar tidak pecah, dan membran lepas dari dinding (plasmolisis) bila volume protoplas di bawah 80 %.",
    concept: "Osmosis: air bergerak melalui membran semipermeabel menuju larutan yang lebih pekat; hipotonis, isotonis, hipertonis; turgor dan plasmolisis.",
    missions: {
      "air-ke-mana": {
        goal: "Sel darah ditetesi air suling; siswa menebak dulu arah air, lalu mengamati.",
        solution: "Air masuk ke sel; sel menggembung lalu pecah (hemolisis).",
        misconception: "Mengira air keluar, atau garam yang bergerak.",
      },
      "cari-isotonis": {
        goal: "Cari kadar garam yang membuat sel darah tetap utuh dan tidak berubah.",
        solution: "0,90 % (toleransi 0,05).",
        misconception: "Mengira air berhenti bergerak sama sekali pada larutan isotonis.",
      },
      plasmolisis: {
        goal: "Buat membran sel bawang merah lepas dari dinding sel.",
        solution: "Kadar garam lebih dari sekitar 1,4 %, misalnya 2,0 %.",
        misconception: "Mengira sel tumbuhan pecah dalam air atau garam masuk ke vakuola.",
      },
    },
  },
};
