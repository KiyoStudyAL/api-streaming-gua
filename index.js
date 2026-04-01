const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// URL Database Firebase Anda
const FIREBASE_DB_URL = "https://movieku-al-default-rtdb.asia-southeast1.firebasedatabase.app";

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: "Online", message: "Movieku API is running fast! 🚀" });
});

app.get('/api/video', async (req, res) => {
  const { tmdb, anilist } = req.query;

  if (!tmdb && !anilist) {
    return res.status(400).json({ error: 'Parameter ?tmdb=ID atau ?anilist=ID diperlukan.' });
  }

  try {
    // Tentukan path URL JSON di Firebase
    const path = tmdb ? `movies/${tmdb}.json` : `anime/${anilist}.json`;
    
    // Langsung tembak ke Firebase REST API
    const response = await fetch(`${FIREBASE_DB_URL}/${path}`);
    const data = await response.json();

    // Jika data null (tidak ada di database)
    if (!data) {
      return res.status(404).json({ error: 'Video tidak ditemukan di database.' });
    }

    // Kirim ke Video Player
    res.json({
      url: data.url || "",
      title: data.title || "Unknown Title",
      description: data.description || "",
      poster: data.poster || "",
      subtitles: data.subtitles || []
    });

  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan mulus di port ${PORT}`);
});
