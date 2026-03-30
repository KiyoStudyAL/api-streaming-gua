const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// [PENTING] Agar Express bisa jalan normal di Render
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Domain CDN kamu
const CLOUDFLARE_DOMAIN = "cdn.nekoplay.web.id"; 

// ----------------------------------------------------
// 0. HALAMAN DEPAN
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.send("<h1 style='text-align:center; margin-top:20%; font-family:sans-serif;'>🚀 API Streaming Aktif & Siap Digunakan!</h1>");
});

// ----------------------------------------------------
// 1. ENDPOINT EMBED (HTML PLAYER)
// ----------------------------------------------------
app.get('/embed/:tmdb_id', async (req, res) => {
    const tmdbId = req.params.tmdb_id;

    try {
        const firebaseURL = `https://movieku-al-default-rtdb.asia-southeast1.firebasedatabase.app/movies/${tmdbId}.json`;
        const firebaseRes = await axios.get(firebaseURL);
        const dataFirebase = firebaseRes.data;

        if (!dataFirebase || !dataFirebase.video_path) {
            return res.status(404).send("<h2 style='color:white; text-align:center; font-family:sans-serif; margin-top:20%'>Video belum tersedia</h2>");
        }

        // [PERBAIKAN] Cek apakah video_path pakai absolute URL atau relative URL
        let videoStreamUrl = dataFirebase.video_path;
        if (!videoStreamUrl.startsWith('http')) {
            videoStreamUrl = `https://${CLOUDFLARE_DOMAIN}${videoStreamUrl}`;
        }

        // [PERBAIKAN] Cek juga URL subtitle untuk mencegah double https
        let tracksHTML = "";
        if (dataFirebase.subtitles) {
            if (dataFirebase.subtitles.indonesian) {
                let subIndo = dataFirebase.subtitles.indonesian;
                if (!subIndo.startsWith('http')) subIndo = `https://${CLOUDFLARE_DOMAIN}${subIndo}`;
                tracksHTML += `<track kind="captions" label="Indonesia" srclang="id" src="${subIndo}" default />\n`;
            }
            if (dataFirebase.subtitles.english) {
                let subEng = dataFirebase.subtitles.english;
                if (!subEng.startsWith('http')) subEng = `https://${CLOUDFLARE_DOMAIN}${subEng}`;
                tracksHTML += `<track kind="captions" label="English" srclang="en" src="${subEng}" />\n`;
            }
        }

        // Render HTML Player
        const htmlPlayer = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${dataFirebase.judul_internal || 'Player'}</title>
            <link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css" />
            <style>
                body { margin: 0; background-color: #000; overflow: hidden; }
                video { width: 100vw; height: 100vh; object-fit: cover; }
                :root { --plyr-color-main: #e50914; } /* Warna merah Netflix */
            </style>
        </head>
        <body>
            <video id="player" controls crossorigin playsinline>
                ${tracksHTML}
            </video>
            
            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
            <script src="https://cdn.plyr.io/3.7.8/plyr.polyfilled.js"></script>
            <script>
                document.addEventListener('DOMContentLoaded', () => {
                    const video = document.querySelector('#player');
                    const source = '${videoStreamUrl}';
                    const defaultOptions = {
                        captions: { active: true, update: true, language: 'id' } 
                    };

                    if (Hls.isSupported()) {
                        const hls = new Hls();
                        hls.loadSource(source);
                        hls.on(Hls.Events.MANIFEST_PARSED, function () {
                            const player = new Plyr(video, defaultOptions);
                        });
                        hls.attachMedia(video);
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = source;
                        const player = new Plyr(video, defaultOptions);
                    }
                });
            </script>
        </body>
        </html>
        `;

        res.send(htmlPlayer);

    } catch (error) {
        console.error("Error embed:", error.message);
        res.status(500).send("<h2 style='color:white; text-align:center;'>Terjadi kesalahan server</h2>");
    }
});

// ----------------------------------------------------
// 2. ENDPOINT API UTAMA (JSON UNTUK FRONTEND)
// ----------------------------------------------------
app.get('/api/movie/:tmdb_id', async (req, res) => {
    const tmdbId = req.params.tmdb_id;
    
    try {
        const tmdbAPIKey = process.env.TMDB_API_KEY; 
        const tmdbURL = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbAPIKey}&language=id-ID`;
        
        const tmdbRes = await axios.get(tmdbURL).catch(() => ({ data: null }));
        const tmdbData = tmdbRes.data;

        // [UPGRADE] Bikin URL Backend dinamis, mendeteksi otomatis protocol (http/https) dan host (localhost/render)
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const BACKEND_URL = `${protocol}://${host}`;

        res.json({
            status: "success",
            data: {
                id_tmdb: tmdbId,
                info: {
                    judul: tmdbData ? tmdbData.title : "Judul Tidak Diketahui",
                    poster: tmdbData && tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : null,
                },
                embed_url: `${BACKEND_URL}/embed/${tmdbId}`
            }
        });

    } catch (error) {
        console.error("Error API:", error.message);
        res.status(500).json({ error: "Terjadi kesalahan", detail: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Backend jalan di port ${PORT}`);
});
