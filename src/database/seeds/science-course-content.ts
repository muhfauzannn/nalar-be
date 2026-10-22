const math = String.raw;

export const scienceCourseContent = {
  name: "Eksplorasi MIPA: Matematika, Biologi, Kimia, dan Fisika",
  description: "Pengantar MIPA tingkat SMA melalui gambaran konsep, contoh penerapan, dan kuis gabungan 20 soal. Materi PDF dapat ditambahkan pengajar pada setiap pelajaran.",
  quizTitle: "Kuis Gabungan MIPA — 20 Soal",
  quizInstructions: "Kerjakan 20 soal pilihan ganda: masing-masing 5 soal Matematika, Biologi, Kimia, dan Fisika. Pilih satu jawaban paling tepat. Setiap soal bernilai 5 poin, dengan total 100 poin. Waktu pengerjaan 60 menit. Kunci jawaban dan pembahasan tersedia setelah kuis dikumpulkan. Gunakan g = 10 m/s² jika diperlukan.",
  modules: [
    {
      key: "matematika",
      title: "Matematika — Pola, Fungsi, dan Data",
      description: "Persamaan linear, fungsi kuadrat, barisan aritmetika, statistika, dan peluang sederhana.",
      lessons: [
        {
          title: "Gambaran Persamaan, Fungsi, dan Barisan",
          content: math`Matematika membantu kita mengenali pola dan menyatakan hubungan antarnilai. Pada persamaan linear, lakukan operasi yang sama pada kedua ruas untuk menemukan nilai variabel. Contoh: \(2x+4=14\) memberi \(x=5\).

Fungsi memetakan setiap masukan ke satu keluaran. Untuk menghitung \(f(a)\), gantikan semua variabel dengan \(a\), lalu ikuti urutan operasi. Pada barisan aritmetika, selisih antarsuku tetap dan suku ke-n dinyatakan oleh \(U_n=a+(n-1)d\).

Tujuan belajar: menyelesaikan persamaan, menentukan nilai fungsi, dan menemukan suku barisan. Coba jelaskan bagaimana biaya langganan atau susunan kursi dapat dimodelkan dengan konsep tersebut. Ini gambaran awal; PDF dan contoh soal tambahan akan dilampirkan pengajar melalui resource pendukung.`,
        },
        {
          title: "Gambaran Statistika dan Peluang",
          content: math`Statistika membantu merangkum data. Rata-rata diperoleh dengan membagi jumlah seluruh nilai dengan banyaknya data: \(\bar{x}=\frac{\sum x_i}{n}\). Bedakan rata-rata, median, dan modus; satu nilai yang sangat besar dapat memengaruhi rata-rata.

Peluang menyatakan kemungkinan kejadian. Jika setiap hasil sama mungkin, \(P(A)=\frac{\text{banyak hasil yang mendukung A}}{\text{banyak seluruh hasil}}\). Misalnya, satu dari empat kartu bertanda bintang memberikan peluang \(\frac14\) saat satu kartu dipilih acak.

Tujuan belajar: menghitung rata-rata dan peluang sederhana, serta menjelaskan asumsi pengambilan sampel. Gambaran ini dapat dilengkapi PDF berisi data, diagram, dan latihan oleh pengajar.`,
        },
      ],
    },
    {
      key: "biologi",
      title: "Biologi — Sel, Pewarisan Sifat, dan Ekosistem",
      description: "Organel sel, fotosintesis, genetika Mendel, aliran energi, dan sistem ekskresi.",
      lessons: [
        {
          title: "Gambaran Sel dan Proses Kehidupan",
          content: "Sel merupakan unit dasar kehidupan. Membran sel mengatur pertukaran zat, inti sel menyimpan sebagian besar informasi genetik pada sel eukariotik, dan mitokondria berperan dalam respirasi aerob untuk menghasilkan ATP. Sel tumbuhan yang berfotosintesis memiliki kloroplas dengan pigmen klorofil.\n\nFotosintesis memanfaatkan energi cahaya untuk membentuk senyawa organik dari karbon dioksida dan air serta melepaskan oksigen. Respirasi sel menggunakan energi kimia dalam senyawa organik untuk menghasilkan ATP; tumbuhan juga melakukan respirasi. Pada ginjal, filtrasi awal darah terjadi di glomerulus, lalu filtrat memasuki kapsula Bowman.\n\nTujuan belajar: menghubungkan struktur organel dengan fungsi, membedakan fotosintesis dan respirasi, serta mengenali tahap awal pembentukan urine. Diagram sel dan sistem organ akan ditambahkan lewat PDF pengajar.",
        },
        {
          title: "Gambaran Genetika dan Aliran Energi",
          content: "Gen membawa informasi pewarisan sifat, sedangkan alel adalah variasi suatu gen. Dalam persilangan monohibrid dengan dominansi penuh, dua individu heterozigot Aa menghasilkan peluang genotipe AA : Aa : aa = 1 : 2 : 1. Peluang ini berlaku untuk setiap keturunan dan tidak menjamin perbandingan persis pada keluarga kecil.\n\nDalam ekosistem, energi mengalir dari produsen ke konsumen dan sebagian besar digunakan untuk aktivitas organisme atau dilepas sebagai panas. Model sederhana perpindahan energi 10% membantu memperkirakan energi pada tingkat trofik berikutnya; nilai sebenarnya dapat berbeda antar-ekosistem.\n\nTujuan belajar: membaca diagram persilangan dan menafsirkan rantai makanan serta piramida energi. PDF berisi diagram persilangan dan ilustrasi ekosistem akan ditambahkan pengajar.",
        },
      ],
    },
    {
      key: "kimia",
      title: "Kimia — Atom, Mol, Reaksi, dan Larutan",
      description: "Struktur atom, ikatan ion, konsep mol, penyetaraan reaksi, dan pH asam kuat.",
      lessons: [
        {
          title: "Gambaran Struktur Atom dan Ikatan Kimia",
          content: math`Atom tersusun atas proton dan neutron dalam inti serta elektron di sekitarnya. Nomor atom \(Z\) menyatakan jumlah proton, sedangkan nomor massa \(A\) adalah jumlah proton dan neutron. Jumlah neutron dapat dihitung dengan \(N=A-Z\). Pada atom netral, jumlah elektron sama dengan jumlah proton.

Ikatan kimia menjelaskan bagaimana partikel bergabung. Pada model pembentukan NaCl, natrium melepaskan elektron sehingga membentuk ion positif dan klorin menerima elektron sehingga membentuk ion negatif. Tarikan elektrostatik antarmuatan berlawanan membentuk ikatan ion.

Tujuan belajar: menentukan jumlah partikel subatom dan membedakan gambaran ikatan ion serta kovalen. Pengajar dapat melengkapi materi dengan PDF tabel periodik dan diagram pembentukan ikatan.`,
        },
        {
          title: "Gambaran Mol, Persamaan Reaksi, dan pH",
          content: math`Mol menghubungkan massa zat dengan jumlah partikelnya. Untuk zat dengan massa molar \(M\), jumlah mol adalah \(n=\frac{m}{M}\). Satuan massa dan massa molar harus konsisten, misalnya gram dan gram per mol.

Persamaan reaksi disetarakan dengan mengubah koefisien, sehingga jumlah atom setiap unsur sama pada kedua ruas. Indeks dalam rumus kimia tidak boleh diubah. Contoh: \(2H_2+O_2\rightarrow2H_2O\).

Pada pendekatan larutan encer tingkat sekolah, \(\mathrm{pH}=-\log_{10}[H^+]\), dengan konsentrasi dalam mol/L. Asam kuat monoprotik seperti HCl dianggap terionisasi sempurna pada soal dasar. Tujuan belajar: menghitung mol, menyetarakan reaksi sederhana, dan menentukan pH dari konsentrasi ion hidrogen. Latihan rinci akan ditambahkan melalui PDF.`,
        },
      ],
    },
    {
      key: "fisika",
      title: "Fisika — Gerak, Energi, dan Listrik",
      description: "Gerak lurus beraturan, Hukum II Newton, energi potensial gravitasi, dan rangkaian listrik sederhana.",
      lessons: [
        {
          title: "Gambaran Gerak, Gaya, dan Energi",
          content: math`Fisika menjelaskan gejala alam melalui besaran, pengukuran, dan model. Pada gerak lurus beraturan, kecepatan tetap dan jarak dapat dihitung dari \(s=vt\). Jika kecepatan berubah, benda mengalami percepatan.

Hukum II Newton menyatakan \(\sum F=ma\): resultan gaya menentukan percepatan suatu benda. Bedakan massa dalam kilogram dan berat sebagai gaya gravitasi dalam newton. Di dekat permukaan Bumi, energi potensial gravitasi relatif terhadap acuan tertentu adalah \(E_p=mgh\).

Tujuan belajar: memilih persamaan sesuai kondisi, memeriksa satuan, dan menjelaskan perubahan energi. Dalam kuis, gunakan \(g=10\,\mathrm{m/s^2}\). Diagram gaya dan contoh perhitungan akan dilengkapi pengajar melalui PDF.`,
        },
        {
          title: "Gambaran Arus dan Rangkaian Listrik",
          content: math`Arus listrik adalah laju aliran muatan. Untuk resistor ohmik pada suhu tetap, hubungan tegangan, arus, dan hambatan dinyatakan oleh Hukum Ohm: \(V=IR\). Gunakan volt untuk tegangan, ampere untuk arus, dan ohm untuk hambatan.

Pada rangkaian seri, arus yang melalui setiap resistor sama dan hambatan total adalah \(R_\text{total}=R_1+R_2+\cdots\). Pada rangkaian paralel, tegangan tiap cabang sama dan kebalikan hambatan total merupakan jumlah kebalikan hambatan setiap cabang.

Tujuan belajar: menghitung arus dari tegangan dan hambatan, mengenali susunan seri atau paralel, serta membaca diagram rangkaian sederhana. Skema rangkaian dan latihan tambahan akan disediakan dalam PDF pengajar.`,
        },
      ],
    },
  ],
} as const;

export const scienceQuestions = [
  {
    subject: "Matematika",
    prompt: math`Nilai \(x\) yang memenuhi \(3x-7=11\) adalah ...`,
    options: ["4", "6", "8", "18"], correctIndex: 1,
    explanation: math`Tambahkan 7 pada kedua ruas sehingga \(3x=18\), lalu bagi 3. Jadi \(x=6\).`,
  },
  {
    subject: "Matematika",
    prompt: math`Jika \(f(x)=2x^2-3x+1\), nilai \(f(3)\) adalah ...`,
    options: ["7", "9", "10", "16"], correctIndex: 2,
    explanation: math`Substitusi \(x=3\) memberi \(f(3)=2(9)-9+1=10\).`,
  },
  {
    subject: "Matematika",
    prompt: "Sebuah kantong berisi 3 bola merah dan 2 bola biru yang berukuran sama. Satu bola diambil secara acak. Peluang memperoleh bola merah adalah ...",
    options: [math`\(\frac35\)`, math`\(\frac25\)`, math`\(\frac32\)`, math`\(\frac15\)`], correctIndex: 0,
    explanation: math`Ada 3 bola merah dari total 5 bola, sehingga peluangnya \(P(\text{merah})=\frac35\).`,
  },
  {
    subject: "Matematika",
    prompt: "Suku pertama barisan aritmetika adalah 4 dan bedanya 3. Suku ke-10 adalah ...",
    options: ["27", "30", "34", "31"], correctIndex: 3,
    explanation: math`Gunakan \(U_n=a+(n-1)d\). Diperoleh \(U_{10}=4+9(3)=31\).`,
  },
  {
    subject: "Matematika",
    prompt: "Rata-rata dari data 6, 7, 8, 9, dan 10 adalah ...",
    options: ["7", "8", "9", "10"], correctIndex: 1,
    explanation: "Jumlah data adalah 40 dan banyaknya data adalah 5. Rata-rata = 40 ÷ 5 = 8.",
  },
  {
    subject: "Biologi",
    prompt: "Organel sel eukariotik yang menjadi tempat utama produksi ATP melalui respirasi aerob adalah ...",
    options: ["Ribosom", "Badan Golgi", "Mitokondria", "Lisosom"], correctIndex: 2,
    explanation: "Mitokondria menjadi tempat siklus Krebs dan fosforilasi oksidatif. Rantai transpor elektron pada membran dalamnya menghasilkan sebagian besar ATP pada respirasi aerob.",
  },
  {
    subject: "Biologi",
    prompt: "Pada sel daun tumbuhan, organel yang menjadi tempat berlangsungnya fotosintesis adalah ...",
    options: ["Kloroplas", "Mitokondria", "Vakuola", "Ribosom"], correctIndex: 0,
    explanation: "Kloroplas mengandung klorofil yang menangkap cahaya. Reaksi terang berlangsung pada membran tilakoid, sedangkan siklus Calvin berlangsung di stroma.",
  },
  {
    subject: "Biologi",
    prompt: "Pada persilangan Aa × Aa dengan dominansi penuh, peluang satu keturunan memiliki genotipe aa adalah ...",
    options: ["0%", "50%", "75%", "25%"], correctIndex: 3,
    explanation: "Kombinasi genotipe yang mungkin adalah AA, Aa, Aa, dan aa. Satu dari empat kombinasi adalah aa, sehingga peluangnya 25%.",
  },
  {
    subject: "Biologi",
    prompt: "Pada rantai makanan rumput → belalang → katak → ular, energi pada rumput adalah 10.000 kJ. Jika tepat 10% energi diteruskan pada setiap perpindahan tingkat trofik dalam model ini, energi yang sampai ke katak adalah ...",
    options: ["10 kJ", "100 kJ", "1.000 kJ", "10.000 kJ"], correctIndex: 1,
    explanation: "Dari rumput ke belalang tersisa 10% × 10.000 = 1.000 kJ. Dari belalang ke katak tersisa 10% × 1.000 = 100 kJ. Angka 10% merupakan asumsi model pada soal.",
  },
  {
    subject: "Biologi",
    prompt: "Struktur ginjal tempat filtrasi awal darah pada pembentukan urine adalah ...",
    options: ["Tubulus distal", "Lengkung Henle", "Glomerulus", "Duktus pengumpul"], correctIndex: 2,
    explanation: "Tekanan darah mendorong air dan zat terlarut kecil melewati penghalang filtrasi glomerulus menuju kapsula Bowman. Sel darah dan sebagian besar protein tetap berada dalam darah.",
  },
  {
    subject: "Kimia",
    prompt: "Suatu atom memiliki nomor atom 11 dan nomor massa 23. Jumlah neutronnya adalah ...",
    options: ["12", "11", "23", "34"], correctIndex: 0,
    explanation: "Jumlah neutron = nomor massa − nomor atom = 23 − 11 = 12. Nomor atom menyatakan jumlah proton.",
  },
  {
    subject: "Kimia",
    prompt: "Diketahui massa molar air adalah 18 g/mol. Jumlah mol dalam 18 gram air adalah ...",
    options: ["0,1 mol", "0,5 mol", "18 mol", "1 mol"], correctIndex: 3,
    explanation: "Gunakan n = m/M = 18 g ÷ 18 g/mol = 1 mol.",
  },
  {
    subject: "Kimia",
    prompt: math`Koefisien bulat terkecil untuk menyetarakan reaksi \(H_2+O_2\rightarrow H_2O\), secara berurutan, adalah ...`,
    options: ["1 : 1 : 1", "2 : 1 : 2", "1 : 2 : 1", "2 : 2 : 1"], correctIndex: 1,
    explanation: math`Reaksi setaranya \(2H_2+O_2\rightarrow2H_2O\). Kedua ruas masing-masing memiliki 4 atom hidrogen dan 2 atom oksigen.`,
  },
  {
    subject: "Kimia",
    prompt: math`Larutan asam kuat memiliki konsentrasi ion hidrogen \([H^+]=10^{-3}\,\mathrm{mol/L}\). Dengan pendekatan \(\mathrm{pH}=-\log_{10}[H^+]\), pH larutan tersebut adalah ...`,
    options: ["1", "2", "3", "11"], correctIndex: 2,
    explanation: math`\(\mathrm{pH}=-\log_{10}(10^{-3})=3\). Larutan bersifat asam.`,
  },
  {
    subject: "Kimia",
    prompt: "Senyawa yang tersusun dari ion positif dan ion negatif yang berikatan secara ionik adalah ...",
    options: ["NaCl", "CO₂", "CH₄", "O₂"], correctIndex: 0,
    explanation: "NaCl tersusun dari ion Na⁺ dan Cl⁻ yang diikat oleh tarikan elektrostatik dalam kisi kristal. CO₂, CH₄, dan O₂ memiliki ikatan kovalen.",
  },
  {
    subject: "Fisika",
    prompt: "Benda bermassa 2 kg mengalami percepatan 3 m/s². Besar resultan gaya yang bekerja pada benda adalah ...",
    options: ["1,5 N", "3 N", "5 N", "6 N"], correctIndex: 3,
    explanation: "Menurut Hukum II Newton, resultan gaya F = ma = 2 × 3 = 6 N.",
  },
  {
    subject: "Fisika",
    prompt: "Sebuah benda bergerak lurus dengan kecepatan tetap 12 m/s selama 5 sekon. Jarak yang ditempuh adalah ...",
    options: ["17 m", "60 m", "2,4 m", "120 m"], correctIndex: 1,
    explanation: "Pada gerak lurus beraturan, s = vt = 12 × 5 = 60 m.",
  },
  {
    subject: "Fisika",
    prompt: "Benda bermassa 2 kg berada pada ketinggian 5 m di atas tanah. Jika g = 10 m/s² dan energi potensial di tanah dianggap nol, energi potensial gravitasinya adalah ...",
    options: ["10 J", "50 J", "100 J", "200 J"], correctIndex: 2,
    explanation: "Energi potensial gravitasi Ep = mgh = 2 × 10 × 5 = 100 J, relatif terhadap acuan di tanah.",
  },
  {
    subject: "Fisika",
    prompt: "Sebuah resistor ohmik 4 Ω pada suhu tetap diberi tegangan 12 V. Arus yang mengalir adalah ...",
    options: ["3 A", "0,33 A", "8 A", "48 A"], correctIndex: 0,
    explanation: "Hukum Ohm memberi I = V/R = 12/4 = 3 A.",
  },
  {
    subject: "Fisika",
    prompt: "Dua resistor masing-masing 2 Ω dan 4 Ω disusun seri. Hambatan total rangkaian adalah ...",
    options: ["1,33 Ω", "2 Ω", "4 Ω", "6 Ω"], correctIndex: 3,
    explanation: "Pada rangkaian seri, hambatan dijumlahkan: Rtotal = R₁ + R₂ = 2 + 4 = 6 Ω.",
  },
] as const;
