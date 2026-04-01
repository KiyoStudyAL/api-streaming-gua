const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Inisialisasi Firebase Admin ke Database Anda
// Catatan: Jika database Anda di-set "private" (rules: read false), 
// Anda perlu menambahkan Service Account Key di Environment Variables Render.
// Tapi jika rules read-nya "true", inisialisasi ini sudah cukup.
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://movieku-al-default-rtdb.asia-southeast1.firebasedatabase.app/"
    });
  } else {
    admin.initializeApp({
      databaseURL: "https://movieku-al-default-rtdb.asia-southeast1.firebasedatabase.app/"
    });
  }
  console.log("✅ Firebase Realtime Database Connected!");
} catch (error) {
  console.error("❌ Firebase Init Error:", error);
}

const db = admin.database();
const app = express();

// Middleware
// Mengizinkan frontend Anda untuk mengambil data dari API ini
app.use(cors({
  origin: '*', // Untuk keamanan ekstra di production, ganti '*' dengan URL frontend Anda
  methods: ['GET', 'POST']
}));
app.use(express.json());

// Endpoint 1: Health Check (Untuk memastikan server hidup di Render)
app.get('/', (req, res) => {
  res.json({ 
    status: "Online", 
    message: "Movieku Streaming API is running perfectly! 🚀",
    database: "movieku-al-default-rtdb"
  });
});

// Endpoint 2: Mengambil Data Video berdasarkan TMDB atau AniList
app.get('/api/video', async (req, res) => {
  const { tmdb, anilist } = req.query;

  // Validasi parameter
  if (!tmdb && !anilist) {
    return res.status(400).json({ 
      error: 'Parameter ?tmdb=ID atau ?anilist=ID sangat diperlukan.' 
    });
  }

  try {
    // Menentukan lokasi data di Firebase berdasarkan parameter
    // Asumsi struktur Firebase Anda: 
    // - /movies/{tmdbId}
    // - /anime/{anilistId}
    let refPath = '';
    if (tmdb) {
      refPath = `movies/${tmdb}`;
    } else if (anilist) {
      refPath = `anime/${anilist}`;
    }

    // Mengambil data dari Firebase Realtime Database
    const snapshot = await db.ref(refPath).once('value');
    const data = snapshot.val();

    // Jika data tidak ditemukan di database
    if (!data) {
      return res.status(404).json({ 
        error: 'Video tidak ditemukan di database kami.' 
      });
    }

    // Mengirimkan data kembali ke Frontend (Video Player)
    // Format ini disesuaikan dengan kebutuhan frontend yang kita buat sebelumnya
    res.json({
      url: data.url || data.streamUrl || "", // Link m3u8 / mp4
      title: data.title || "Unknown Title",
      description: data.description || "",
      poster: data.poster || "",
      subtitles: data.subtitles || [] // Array subtitle jika ada
    });

  } catch (error) {
    console.error("🔥 Database Fetch Error:", error);
    res.status(500).json({ 
      error: 'Terjadi kesalahan pada server saat mengambil data.' 
    });
  }
});

// Menjalankan Server
// Render.com secara otomatis akan memberikan port melalui process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
