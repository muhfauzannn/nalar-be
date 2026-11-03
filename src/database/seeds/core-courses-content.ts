const math = String.raw;

// The four core Bernalar courses: one SMA topic each, taught by one lab and
// practised with an untimed quiz. Wrong options are the common misconceptions
// for that topic, so a wrong pick tells the teacher what to talk about.

export type CoreQuestion = { prompt: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3; explanation: string };

export type CoreCourse = {
  key: "matematika" | "fisika" | "kimia" | "biologi";
  subjectCode: "MAT" | "FIS" | "KIM" | "BIO";
  name: string;
  description: string;
  module: { title: string; description: string };
  lesson: { title: string; content: string };
  labKey: string;
  quizTitle: string;
  quizInstructions: string;
  questions: CoreQuestion[];
};

const untimed = "Latihan ini tanpa batas waktu dan boleh dikerjakan sambil membuka lab. Pilih satu jawaban paling tepat; setiap soal bernilai 10 poin. Pembahasan muncul setelah latihan dikumpulkan.";

export const coreCourses: CoreCourse[] = [
  {
    key: "matematika",
    subjectCode: "MAT",
    name: "Matematika",
    description: "Fungsi trigonometri dari lingkaran ke gelombang: sudut, radian, amplitudo, dan periode, lewat lab Mesin Gelombang.",
    module: { title: "Fungsi Trigonometri", description: "Dari putaran roda ke grafik y = A sin bx." },
    lesson: {
      title: "Mesin Gelombang: dari Lingkaran ke Grafik Sinus",
      content: math`Bayangkan sebuah pasak pada roda yang berputar. Tinggi pasak di atas poros selalu \(A\sin\theta\), dengan \(A\) jarak pasak dari poros dan \(\theta\) sudut putaran. Jika tinggi itu dicatat untuk setiap sudut, terbentuklah grafik sinus.

Dua hal mengubah bentuk gelombang. Amplitudo \(A\) menentukan tinggi puncak. Bilangan \(b\) pada \(y=A\sin bx\) menentukan seberapa cepat gelombang berulang: periodenya \(\frac{360^\circ}{b}\) atau \(\frac{2\pi}{b}\). Ingat juga \(180^\circ=\pi\) radian.

Di lab, putar engkol dan perhatikan garis putus-putus yang menghubungkan pasak dengan pena: keduanya selalu sama tinggi. Selesaikan tiga misi: temukan semua sudut dengan \(\sin\theta=\frac12\), temukan periode saat roda gigi 2×, lalu tiru gelombang ungu.`,
    },
    labKey: "mesin-gelombang",
    quizTitle: "Latihan Fungsi Trigonometri",
    quizInstructions: untimed,
    questions: [
      { prompt: "Nilai sin 30° adalah …", options: ["½", "½√3", "1", "0"], correctIndex: 0, explanation: "sin 30° = ½. Nilai ½√3 adalah cos 30° (atau sin 60°), dua nilai yang sering tertukar." },
      { prompt: "Untuk 0° ≤ x ≤ 360°, sudut yang memenuhi sin x = ½ adalah …", options: ["30° dan 150°", "30° saja", "30° dan 210°", "60° dan 120°"], correctIndex: 0, explanation: "Sinus positif di kuadran I dan II, jadi x = 30° dan 180° − 30° = 150°. Di 210° sinus bernilai −½." },
      { prompt: "Sudut 150° dinyatakan dalam radian adalah …", options: ["5π/6", "5π/3", "3π/4", "150π"], correctIndex: 0, explanation: "150° × π/180° = 5π/6." },
      { prompt: "Amplitudo fungsi y = 3 sin 2x adalah …", options: ["3", "2", "6", "3/2"], correctIndex: 0, explanation: "Amplitudo adalah |A| = 3. Bilangan 2 mengubah periode, bukan tinggi gelombang." },
      { prompt: "Periode fungsi y = 3 sin 2x adalah …", options: ["180°", "360°", "720°", "90°"], correctIndex: 0, explanation: "Periode = 360°/b = 360°/2 = 180°. Periode dibagi b, bukan dikali." },
      { prompt: "Nilai maksimum fungsi y = 2 sin x + 1 adalah …", options: ["3", "2", "1", "4"], correctIndex: 0, explanation: "Nilai terbesar sin x adalah 1, sehingga y maksimum = 2·1 + 1 = 3." },
      { prompt: "Pada interval 0° ≤ x ≤ 360°, berapa kali grafik y = sin 2x mencapai puncaknya?", options: ["2 kali", "1 kali", "4 kali", "Tidak pernah"], correctIndex: 0, explanation: "Periodenya 180°, jadi dalam 360° terdapat dua gelombang penuh dan dua puncak (di 45° dan 225°)." },
      { prompt: "Pada lab Mesin Gelombang, menggeser pasak menjauhi poros roda mengubah …", options: ["amplitudo", "periode", "titik awal gelombang", "jumlah gelombang"], correctIndex: 0, explanation: "Jarak pasak dari poros adalah A. Makin jauh pasak, makin tinggi puncak gelombang." },
      { prompt: "Mengganti roda gigi 1× dengan roda gigi 2× membuat gelombang …", options: ["berulang dua kali lebih cepat (periode setengahnya)", "dua kali lebih tinggi", "berulang dua kali lebih lambat", "bergeser ke kanan"], correctIndex: 0, explanation: "Roda gigi 2× memutar roda dua kali untuk setiap putaran engkol, jadi b = 2 dan periodenya menjadi setengah." },
      { prompt: "Fungsi dengan amplitudo 1,5 dan periode π adalah …", options: ["y = 1,5 sin 2x", "y = 2 sin 1,5x", "y = 1,5 sin ½x", "y = 1,5 sin πx"], correctIndex: 0, explanation: "A = 1,5 dan 2π/b = π, sehingga b = 2." },
    ],
  },
  {
    key: "fisika",
    subjectCode: "FIS",
    name: "Fisika",
    description: "Gerak parabola: kecepatan horizontal tetap, vertikal berubah karena gravitasi, lewat lab meriam di atas tebing.",
    module: { title: "Gerak Parabola", description: "Gerak dua dimensi tanpa hambatan udara." },
    lesson: {
      title: "Gerak Parabola: Meriam di Atas Tebing",
      content: math`Benda yang dilempar miring bergerak dalam dua arah sekaligus. Ke arah mendatar, tidak ada gaya, sehingga kecepatan horizontal \(v_x=v_0\cos\theta\) tetap. Ke arah tegak, gravitasi mengurangi kecepatan \(v_y=v_0\sin\theta-gt\) setiap detik. Gabungan keduanya membentuk lintasan parabola.

Di tanah datar, jangkauan \(R=\frac{v_0^2\sin2\theta}{g}\) terbesar pada \(45^\circ\), dan dua sudut yang jumlahnya \(90^\circ\) memberi jangkauan sama. Massa bola tidak muncul di rumus mana pun: tanpa hambatan udara, bola ringan dan berat terbang sama jauh.

Di lab, atur sudut laras dan takaran mesiu, lalu tembak. Perhatikan kereta kecil di bawah bola: ia bergerak dengan kecepatan tetap, tepat di bawah bola sepanjang terbang.`,
    },
    labKey: "gerak-parabola",
    quizTitle: "Latihan Gerak Parabola",
    quizInstructions: `${untimed} Gunakan g = 10 m/s² dan abaikan hambatan udara.`,
    questions: [
      { prompt: "Pada gerak parabola tanpa hambatan udara, komponen kecepatan horizontal benda …", options: ["tetap", "bertambah", "berkurang hingga nol di titik tertinggi", "nol di titik tertinggi lalu bertambah"], correctIndex: 0, explanation: "Tidak ada gaya mendatar, jadi vx tidak berubah sepanjang lintasan." },
      { prompt: "Di titik tertinggi lintasan, kecepatan benda …", options: ["hanya memiliki komponen horizontal", "nol", "hanya memiliki komponen vertikal", "sama dengan kecepatan awal"], correctIndex: 0, explanation: "Di puncak vy = 0, tetapi vx tetap ada. Kecepatan tidak nol." },
      { prompt: "Percepatan benda di titik tertinggi adalah …", options: ["10 m/s² ke bawah", "nol", "10 m/s² ke atas", "bergantung pada massa benda"], correctIndex: 0, explanation: "Gravitasi bekerja di setiap titik lintasan, termasuk di puncak." },
      { prompt: "Bola ditendang dengan kecepatan 20 m/s pada sudut 30°. Waktu untuk mencapai titik tertinggi adalah …", options: ["1 s", "2 s", "1,73 s", "0,5 s"], correctIndex: 0, explanation: "vy = 20 sin 30° = 10 m/s, sehingga t = vy/g = 10/10 = 1 s. Nilai 2 s adalah waktu total di tanah datar." },
      { prompt: "Pada tanah datar dan kecepatan awal tetap, jangkauan terjauh diperoleh dengan sudut …", options: ["45°", "90°", "60°", "30°"], correctIndex: 0, explanation: "sin 2θ terbesar saat 2θ = 90°, yaitu θ = 45°. Sudut 90° justru jatuh di tempat semula." },
      { prompt: "Dengan kecepatan awal yang sama di tanah datar, pasangan sudut yang memberi jangkauan sama adalah …", options: ["30° dan 60°", "30° dan 45°", "20° dan 40°", "45° dan 90°"], correctIndex: 0, explanation: "sin 2θ sama untuk θ dan 90° − θ, karena sin 60° = sin 120°." },
      { prompt: "Bola 1 kg dan bola 5 kg ditembakkan dengan sudut dan kecepatan awal yang sama. Tanpa hambatan udara …", options: ["keduanya jatuh di jarak yang sama", "bola 5 kg lebih jauh", "bola 1 kg lebih jauh", "bola 5 kg terbang lebih tinggi"], correctIndex: 0, explanation: "Percepatan gravitasi sama untuk semua massa, jadi lintasannya identik." },
      { prompt: "Jangkauan bola yang ditembakkan 20 m/s pada sudut 45° di tanah datar adalah …", options: ["40 m", "20 m", "80 m", "28,3 m"], correctIndex: 0, explanation: "R = v₀² sin 90° / g = 400/10 = 40 m." },
      { prompt: "Batu dilempar mendatar dari tebing setinggi 20 m. Waktu batu sampai ke tanah adalah …", options: ["2 s", "4 s", "1,4 s", "bergantung pada kecepatan lemparan"], correctIndex: 0, explanation: "Gerak tegak tidak dipengaruhi kecepatan mendatar: 20 = ½·10·t², t = 2 s." },
      { prompt: "Tinggi maksimum bola yang ditembakkan 20 m/s pada sudut 30° adalah …", options: ["5 m", "10 m", "20 m", "15 m"], correctIndex: 0, explanation: "vy = 10 m/s, h = vy²/(2g) = 100/20 = 5 m." },
    ],
  },
  {
    key: "kimia",
    subjectCode: "KIM",
    name: "Kimia",
    description: "Laju reaksi dan teori tumbukan: suhu, konsentrasi, dan katalis, lewat lab Reaktor Tumbukan.",
    module: { title: "Laju Reaksi", description: "Mengapa sebagian reaksi cepat dan sebagian lambat." },
    lesson: {
      title: "Reaktor Tumbukan: Mengapa Reaksi Bisa Dipercepat",
      content: math`Partikel pereaksi terus bergerak dan bertumbukan, tetapi hanya sebagian kecil tumbukan yang menghasilkan reaksi: tumbukan yang energinya paling sedikit sama dengan energi aktivasi \(E_a\) dan arahnya tepat. Itulah teori tumbukan.

Menaikkan suhu membuat jauh lebih banyak tumbukan cukup bertenaga; untuk banyak reaksi, naik \(10\) K membuat laju sekitar \(2\times\). Menaikkan konsentrasi menambah jumlah tumbukan. Katalis menyediakan jalan pintas dengan \(E_a\) lebih rendah, dan katalis tidak ikut habis.

Di lab, putar kenop pemanas, tekan pompa larutan, dan celupkan keranjang katalis. Kilatan kuning adalah tumbukan yang berhasil; jarum pada pengukur menunjukkan laju dibanding campuran awal.`,
    },
    labKey: "reaktor-tumbukan",
    quizTitle: "Latihan Laju Reaksi",
    quizInstructions: untimed,
    questions: [
      { prompt: "Menurut teori tumbukan, reaksi terjadi apabila partikel pereaksi …", options: ["bertumbukan dengan energi minimal sebesar Ea dan orientasi yang tepat", "bertumbukan, apa pun energinya", "bergerak cepat meskipun tidak bertumbukan", "memiliki ukuran yang sama"], correctIndex: 0, explanation: "Hanya tumbukan efektif (energi cukup dan arah tepat) yang menghasilkan reaksi." },
      { prompt: "Kenaikan suhu mempercepat reaksi terutama karena …", options: ["jumlah tumbukan yang berenergi ≥ Ea meningkat tajam", "energi aktivasi menjadi lebih kecil", "ukuran partikel membesar", "konsentrasi pereaksi bertambah"], correctIndex: 0, explanation: "Suhu tidak mengubah Ea, tetapi memperbesar bagian partikel yang energinya melewati Ea." },
      { prompt: "Laju suatu reaksi menjadi 2 kali setiap suhu naik 10 °C. Jika laju pada 25 °C adalah v, laju pada 55 °C adalah …", options: ["8v", "6v", "3v", "30v"], correctIndex: 0, explanation: "Naik 30 °C berarti tiga kali naik 10 °C: 2 × 2 × 2 = 8 kali." },
      { prompt: "Katalis mempercepat reaksi dengan cara …", options: ["menyediakan jalur reaksi dengan energi aktivasi lebih rendah", "menaikkan suhu campuran", "menambah energi setiap tumbukan", "menambah jumlah hasil reaksi"], correctIndex: 0, explanation: "Katalis membuka jalan pintas dengan Ea lebih rendah; suhu dan jumlah hasil akhir tidak berubah." },
      { prompt: "Setelah reaksi selesai, massa katalis …", options: ["tetap seperti semula", "habis terpakai", "berkurang sebagian", "bertambah"], correctIndex: 0, explanation: "Katalis ikut dalam tahap reaksi tetapi terbentuk kembali, jadi massanya tetap." },
      { prompt: "Menaikkan konsentrasi pereaksi mempercepat reaksi karena …", options: ["tumbukan antarpartikel menjadi lebih sering", "energi aktivasi turun", "energi setiap partikel naik", "suhu larutan naik"], correctIndex: 0, explanation: "Lebih banyak partikel dalam volume yang sama berarti lebih banyak tumbukan setiap detik." },
      { prompt: "Untuk reaksi dengan laju v = k[A], konsentrasi A dinaikkan dari 0,5 M menjadi 1,5 M. Lajunya menjadi …", options: ["3 kali", "1,5 kali", "9 kali", "tetap"], correctIndex: 0, explanation: "Laju sebanding dengan [A] berpangkat satu: 1,5/0,5 = 3." },
      { prompt: "Pualam serbuk dan pualam bongkahan bermassa sama direaksikan dengan HCl yang sama. Yang benar adalah …", options: ["serbuk lebih cepat karena luas permukaan sentuhnya lebih besar", "bongkahan lebih cepat karena lebih padat", "keduanya sama cepat karena massanya sama", "serbuk lebih lambat karena partikelnya kecil"], correctIndex: 0, explanation: "Makin luas permukaan yang bersentuhan, makin banyak tumbukan." },
      { prompt: "Pada diagram energi reaksi, katalis mengubah …", options: ["tinggi puncak (energi aktivasi) saja", "energi pereaksi", "energi hasil reaksi", "perubahan entalpi (ΔH)"], correctIndex: 0, explanation: "Titik awal dan akhir tetap, jadi ΔH tetap; hanya puncaknya yang turun." },
      { prompt: "Sebuah reaksi berlangsung 40 detik pada 20 °C. Laju menjadi 2 kali setiap naik 10 °C. Pada 40 °C reaksi berlangsung …", options: ["10 detik", "20 detik", "80 detik", "160 detik"], correctIndex: 0, explanation: "Naik 20 °C membuat laju 4 kali, sehingga waktunya menjadi 40/4 = 10 detik." },
    ],
  },
  {
    key: "biologi",
    subjectCode: "BIO",
    name: "Biologi",
    description: "Transpor membran dan osmosis: sel darah merah dan sel bawang merah dalam larutan garam, lewat lab Mikroskop Osmosis.",
    module: { title: "Transpor Membran", description: "Bagaimana air keluar-masuk sel." },
    lesson: {
      title: "Mikroskop Osmosis: Ke Mana Air Bergerak?",
      content: "Membran sel dapat dilewati air, tetapi tidak oleh banyak zat terlarut seperti garam. Karena itu, air berpindah dari larutan yang lebih encer (hipotonis) ke larutan yang lebih pekat (hipertonis). Perpindahan air melalui membran semipermeabel ini disebut osmosis.\n\nSel darah merah tidak memiliki dinding. Dalam larutan hipotonis, sel menggembung lalu pecah (hemolisis); dalam larutan hipertonis, sel mengkerut (krenasi). Larutan NaCl 0,9 % bersifat isotonis: air masuk dan keluar sama banyak. Sel tumbuhan memiliki dinding sel, sehingga dalam air ia menjadi tegang (turgid) tanpa pecah, dan dalam larutan pekat membrannya lepas dari dinding (plasmolisis).\n\nDi lab, geser cincin pada pipet untuk memilih kadar garam, teteskan ke kaca preparat, lalu amati melalui lensa. Panah biru menunjukkan arah air.",
    },
    labKey: "mikroskop-osmosis",
    quizTitle: "Latihan Osmosis",
    quizInstructions: untimed,
    questions: [
      { prompt: "Osmosis adalah perpindahan …", options: ["air melalui membran semipermeabel dari larutan encer ke larutan pekat", "zat terlarut dari larutan pekat ke larutan encer melalui membran", "air dari larutan pekat ke larutan encer", "zat apa saja tanpa melalui membran"], correctIndex: 0, explanation: "Pada osmosis yang berpindah adalah air, menuju sisi yang lebih pekat. Perpindahan zat terlarut disebut difusi." },
      { prompt: "Sel darah merah dimasukkan ke dalam air suling. Yang terjadi adalah …", options: ["sel menggembung lalu pecah (hemolisis)", "sel mengkerut (krenasi)", "sel tidak berubah", "sel mengalami plasmolisis"], correctIndex: 0, explanation: "Air suling hipotonis, jadi air masuk sampai membran tidak sanggup menahan. Plasmolisis hanya terjadi pada sel berdinding." },
      { prompt: "Bagi sel darah merah, larutan NaCl 0,9 % bersifat …", options: ["isotonis", "hipotonis", "hipertonis", "asam"], correctIndex: 0, explanation: "Kepekatan larutan 0,9 % sama dengan cairan sel darah merah." },
      { prompt: "Sel darah merah dalam larutan NaCl 3 % akan …", options: ["mengkerut karena air keluar dari sel", "pecah karena garam masuk", "menggembung karena air masuk", "tetap, karena garam masuk sampai seimbang"], correctIndex: 0, explanation: "Larutan 3 % hipertonis, jadi air keluar dari sel. Garam tidak bebas menembus membran." },
      { prompt: "Plasmolisis adalah peristiwa …", options: ["lepasnya membran sel dari dinding sel karena sel kehilangan air", "pecahnya sel tumbuhan karena kemasukan air", "menebalnya dinding sel", "masuknya garam ke dalam vakuola"], correctIndex: 0, explanation: "Protoplas mengecil saat air keluar, sedangkan dinding sel yang kaku tetap di tempatnya." },
      { prompt: "Sel tumbuhan yang direndam dalam air suling tidak pecah karena …", options: ["dinding sel menahan tekanan turgor", "membrannya tidak dapat dilalui air", "vakuola membuang air yang masuk", "sel tumbuhan tidak mengalami osmosis"], correctIndex: 0, explanation: "Air tetap masuk, tetapi dinding sel menahan sel sehingga sel menjadi turgid." },
      { prompt: "Dalam larutan isotonis, pergerakan air antara sel dan larutan …", options: ["masuk dan keluar sama banyak", "berhenti sama sekali", "hanya keluar dari sel", "hanya masuk ke sel"], correctIndex: 0, explanation: "Air tetap bergerak dua arah; hanya saja tidak ada perpindahan bersih." },
      { prompt: "Larutan yang hipertonis terhadap sel adalah larutan yang …", options: ["lebih pekat daripada cairan sel", "lebih encer daripada cairan sel", "sama pekatnya dengan cairan sel", "tidak mengandung zat terlarut"], correctIndex: 0, explanation: "Hiper berarti lebih: kadar zat terlarutnya lebih tinggi daripada di dalam sel." },
      { prompt: "Cairan infus dibuat isotonis dengan darah agar …", options: ["sel darah tidak pecah maupun mengkerut", "cepat diserap oleh usus", "membunuh bakteri di pembuluh darah", "menambah jumlah sel darah merah"], correctIndex: 0, explanation: "Dalam larutan isotonis volume sel darah tetap." },
      { prompt: "Ikan air tawar yang dipindahkan ke air laut akan kehilangan air dari tubuhnya karena air laut …", options: ["hipertonis terhadap cairan tubuh ikan", "hipotonis terhadap cairan tubuh ikan", "isotonis terhadap cairan tubuh ikan", "membuat garam menggantikan air di dalam sel"], correctIndex: 0, explanation: "Air bergerak ke sisi yang lebih pekat, yaitu air laut." },
    ],
  },
];
