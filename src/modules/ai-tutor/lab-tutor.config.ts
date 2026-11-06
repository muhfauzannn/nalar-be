import type { LabKey } from "../labs/lab-catalog";

// What the AI Tutor knows about each lab: the machine on the screen, the idea it
// shows, and each mission with the settings that solve it. The solutions are for
// the tutor to steer by and must never be said to the student. Keep in step with
// the lab models in nalar-fe/app/features/labs/*/model.ts.

export type LabTutorBrief = {
  machine: string;
  /** The story the lab tells around its missions (nalar-fe/app/features/labs/<lab>/story.ts). */
  story: string;
  concept: string;
  /**
   * The parts of the machine the tutor may point at (tool `point_at_lab_part`): id, then what
   * it is and what it does. The ids are `data-lab-part` in the lab's own markup
   * (nalar-fe/app/features/labs); a test there keeps the two in step.
   */
  parts: Record<string, string>;
  missions: Record<string, { goal: string; solution: string; misconception: string }>;
};

export function labPartIds(labKey: string) {
  const brief = LAB_TUTOR_BRIEFS[labKey as LabKey];
  return brief ? Object.keys(brief.parts) : [];
}

// How the tutor points (the same plan-then-say pattern as the PDF tutor). Pointing never
// reveals a mission's solution: it only shows where to look or what to change.
export function labPointerInstructions(brief: LabTutorBrief) {
  return [
    "Bagian alat yang bisa kamu tunjuk dengan tool point_at_lab_part (id: penjelasan):",
    ...Object.entries(brief.parts).map(([id, text]) => `- ${id}: ${text}`),
    "Menunjuk adalah cara utamamu mengajar di lab. Setelah classify_student_prompt dan SEBELUM berbicara, panggil point_at_lab_part SEKALI berisi 1–4 langkah berurutan, satu langkah per bagian yang akan kamu bahas. Setiap langkah punya part (id di atas), say (2–5 kata pertama PERSIS yang akan kamu ucapkan saat mulai membahas bagian itu) dan caption singkat. Setelah hasil ok, bicaralah dengan urutan yang sama dan benar-benar ucapkan kata say itu apa adanya. Aplikasi menyorot setiap bagian tepat saat kata say terdengar.",
    "Tunjuk kontrol yang perlu diubah atau pengukur yang perlu diamati, tanpa menyebut nilai atau pengaturan yang menyelesaikan misi: menunjuk tidak boleh membocorkan penyelesaian. Hasil error berarti penunjuk TIDAK tampil; jangan mengaku sudah menunjuk, lanjutkan penjelasan dengan kata-kata dan jangan ulangi tool itu pada giliran yang sama. Hanya sapaan, terima kasih, atau jawaban ya/tidak singkat yang boleh tanpa menunjuk.",
  ];
}

export const LAB_TUTOR_BRIEFS: Record<LabKey, LabTutorBrief> = {
  "gerak-parabola": {
    story:
      "Cerita lab \"Jembatan Putus\": longsor memutus jalan ke Benteng Tua tempat warga mengungsi, jadi siswa mengirim bantuan dengan meriam tua di dalam bola besi berongga. Bendera adalah titik jemput warga; misi 3 membandingkan bola obat 1 kg dan bola beras 5 kg.",
    machine:
      "Meriam di atas tebing setinggi 6 m menembakkan bola ke lapangan sepanjang 40 m. Siswa mengatur sudut laras (10°–80°) dan takaran mesiu (kecepatan awal 8–22 m/s), memilih bola 1 kg atau 5 kg, lalu menembak. Sebuah kereta kecil berjalan tepat di bawah bola. Tanpa hambatan udara, g = 9,8 m/s².",
    concept: "Gerak parabola: kecepatan mendatar tetap, kecepatan tegak berkurang g tiap detik, massa tidak memengaruhi lintasan.",
    parts: {
      laras: "Laras meriam di atas tebing. Sudutnya (10°–80°) diatur dengan pegangan hijau di ujung laras.",
      mesiu: "Tong mesiu dengan kolom takaran. Pegangan hijau di kolom mengatur kecepatan awal bola (8–22 m/s).",
      bola: "Rak dua bola (1 kg dan 5 kg). Menyentuh salah satu cangkir memilih bola yang dimuat.",
      bendera: "Bendera sasaran di lapangan. Jaraknya dari tebing tampil pada angka melayang.",
      kereta: "Kereta kecil yang berjalan tepat di bawah bola dan memperlihatkan gerak mendatarnya.",
      tembak: "Tombol Tembak! di bawah gambar; menembakkan bola dengan pengaturan saat ini.",
    },
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
    story:
      "Cerita lab \"Peramal Pasang\": siswa menggantikan petugas pelabuhan yang memutar mesin peramal pasang; y adalah tinggi air dan satu putaran engkol satu siklus pasang. Misi 1 ambang kapal di y = 0,5, misi 2 pelabuhan dengan pasang lebih sering, misi 3 meniru rekaman stasiun pasang.",
    machine:
      "Engkol memutar roda lewat sabuk dengan roda gigi 1× atau 2×. Sebuah pasak di roda berjarak A (0,5–2) dari poros; pena di papan grafik selalu setinggi pasak, sehingga memutar engkol menggambar y = A·sin(b·θ) terhadap sudut engkol θ (0°–360°). Siswa bisa menandai titik pada grafik.",
    concept: "Fungsi sinus sebagai tinggi titik pada lingkaran; amplitudo A dan periode 360°/b.",
    parts: {
      engkol: "Engkol di depan. Pegangan hijaunya diputar untuk memutar roda (sudut θ, 0°–360°).",
      pasak: "Pasak pada roda. Pegangan hijaunya digeser sepanjang jari-jari untuk mengubah jarak A (0,5–2) dari poros.",
      "roda-gigi": "Pilihan roda gigi 1× atau 2× di bawah gambar; menentukan berapa kali roda berputar tiap satu putaran engkol.",
      grafik: "Papan grafik tempat pena menggambar y = A·sin(b·θ) terhadap sudut engkol.",
      pena: "Pena di papan grafik, selalu setinggi pasak (garis putus-putus hijau menghubungkannya).",
      tombol: "Tombol di kanan bawah: Tandai (menandai sudut pada grafik) atau Bandingkan (mencocokkan dengan gelombang ungu).",
    },
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
    story:
      "Cerita lab \"Hari Pertama Jadi Operator\": siswa operator baru di pabrik di bawah Bu Sari, kepala shift. Misi 1 pesanan 2× lebih cepat, misi 2 pertanyaan bagian keuangan soal katalis mahal, misi 3 pesanan besar dengan batas kaca reaktor.",
    machine:
      "Reaktor kaca berisi partikel A (merah) dan B (biru) di atas pemanas. Siswa memutar kenop pemanas (290–340 K), menekan pompa suntik untuk konsentrasi (0,5–2,0 M), dan mencelupkan keranjang katalis. Kilatan kuning adalah tumbukan yang berhasil, cincin abu-abu tumbukan yang memantul. Pengukur menunjukkan laju dibanding campuran awal (300 K, 1,0 M, tanpa katalis). Ea = 53,6 kJ/mol, dengan katalis 48,4 kJ/mol; laju ∝ k·[A].",
    concept: "Teori tumbukan dan laju reaksi: suhu menambah bagian tumbukan yang energinya ≥ Ea, konsentrasi menambah jumlah tumbukan, katalis menurunkan Ea dan tidak habis.",
    parts: {
      pemanas: "Kenop pemanas di bawah reaktor (290–340 K). Memutarnya mengubah suhu.",
      pompa: "Pompa suntik di sisi reaktor. Pegangan hijaunya mengubah konsentrasi (0,5–2,0 M).",
      katalis: "Keranjang katalis di atas reaktor. Pegangan hijaunya mencelupkan atau mengangkatnya.",
      pengukur: "Pengukur laju di sisi gambar. Jarumnya menunjukkan laju dibanding campuran awal.",
      reaksikan: "Tombol Reaksikan di kanan bawah; menjalankan reaksi lalu mengukur lajunya.",
    },
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
    story:
      "Cerita lab \"Shift Malam di Klinik\": siswa magang di klinik dan diuji Kak Rani, perawat jaga: kenapa infus tidak boleh air murni (misi 1), larutan apa yang aman (misi 2), lalu pertanyaan ibu kantin soal bawang acar yang lemas setelah digarami (misi 3).",
    machine:
      "Mikroskop dengan pipet berskala 0–3 % NaCl. Siswa menggeser cincin pipet, meneteskan larutan ke kaca preparat, lalu mengamati sel di lensa: panah biru adalah arah air, titik kuning adalah garam. Sel darah merah isotonis dengan 0,9 %, pecah bila volumenya ≥ 160 %, mengkerut di bawah 90 %. Sel bawang merah isotonis sekitar 1,0 %; dindingnya menahan sel agar tidak pecah, dan membran lepas dari dinding (plasmolisis) bila volume protoplas di bawah 80 %.",
    concept: "Osmosis: air bergerak melalui membran semipermeabel menuju larutan yang lebih pekat; hipotonis, isotonis, hipertonis; turgor dan plasmolisis.",
    parts: {
      pipet: "Cincin skala pada pipet. Pegangan hijaunya digeser untuk memilih kadar garam NaCl (0–3 %).",
      lensa: "Bidang pandang mikroskop yang memperlihatkan sel, panah air (biru), dan garam (titik kuning).",
      teteskan: "Tombol Teteskan di kanan bawah; meneteskan larutan dari pipet ke kaca preparat.",
    },
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
