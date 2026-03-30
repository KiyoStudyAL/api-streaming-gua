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

// --- Variabel Cache untuk API Semua Film ---
let moviesCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // Cache 1 Jam (dalam milidetik)

// ----------------------------------------------------
// 0. HALAMAN DEPAN BACKEND
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.send(`
        <div style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#0f0f0f; color:white; font-family:sans-serif;">
            <h1>🚀 API Streaming & Movie Data Aktif!</h1>
        </div>
    `);
});

// ----------------------------------------------------
// 1. ENDPOINT EMBED (HTML PLAYER VIP)
// ----------------------------------------------------
app.get('/embed/:tmdb_id', async (req, res) => {
    const tmdbId = req.params.tmdb_id;

    try {
        const firebaseURL = `https://movieku-al-default-rtdb.asia-southeast1.firebasedatabase.app/movies/${tmdbId}.json`;
        const firebaseRes = await axios.get(firebaseURL);
        const dataFirebase = firebaseRes.data;

        if (!dataFirebase || !dataFirebase.video_path) {
            return res.status(404).send(`
                <div style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#000; color:#fff; font-family:sans-serif;">
                    <h2>Oopss! Video belum tersedia 🎬</h2>
                </div>
            `);
        }

        let videoStreamUrl = dataFirebase.video_path;
        if (!videoStreamUrl.startsWith('http')) {
            videoStreamUrl = `https://${CLOUDFLARE_DOMAIN}${videoStreamUrl}`;
        }

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

        const htmlPlayer = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${dataFirebase.judul_internal || 'Player VIP'}</title>
            <link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css" />
            <style>
                body { margin: 0; background-color: #000; overflow: hidden; font-family: sans-serif; }
                video { width: 100vw; height: 100vh; object-fit: cover; }
                :root { --plyr-color-main: #e50914; --plyr-video-control-color-hover: #fff; }
            </style>
        </head>
        <body>
            <video id="player" playsinline controls crossorigin>
                ${tracksHTML}
            </video>
            
            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
            <script src="https://cdn.plyr.io/3.7.8/plyr.polyfilled.js"></script>
            <script>
                document.addEventListener('DOMContentLoaded', () => {
                    const video = document.querySelector('#player');
                    const source = '${videoStreamUrl}';
                    
                    const defaultOptions = {
                        captions: { active: true, update: true, language: 'id' },
                        controls:['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
                        settings:['captions', 'quality', 'speed'],
                        speed: { selected: 1, options:[0.5, 0.75, 1, 1.25, 1.5, 2] }
                    };

                    if (Hls.isSupported()) {
                        const hls = new Hls();
                        hls.loadSource(source);
                        hls.attachMedia(video);

                        hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                            const availableQualities = hls.levels.map((l) => l.height);
                            availableQualities.unshift(0); 

                            defaultOptions.quality = {
                                default: 0,
                                options: availableQualities,
                                forced: true,
                                onChange: (newQuality) => {
                                    if (newQuality === 0) hls.currentLevel = -1;
                                    else hls.levels.forEach((level, levelIndex) => {
                                        if (level.height === newQuality) hls.currentLevel = levelIndex;
                                    });
                                }
                            };

                            defaultOptions.i18n = { qualityLabel: { 0: 'Auto' } };
                            new Plyr(video, defaultOptions);
                        });

                        hls.on(Hls.Events.ERROR, function (event, data) {
                            if (data.fatal) {
                                switch (data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        hls.startLoad(); break;
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        hls.recoverMediaError(); break;
                                    default:
                                        hls.destroy(); break;
                                }
                            }
                        });

                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = source;
                        new Plyr(video, defaultOptions);
                    }
                });
            </script>
        </body>
        </html>
        `;

        res.send(htmlPlayer);

    } catch (error) {
        console.error("Error embed:", error.message);
        res.status(500).send(`
            <div style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#000; color:#fff; font-family:sans-serif;">
                <h2>Terjadi kesalahan server internal 🛠️</h2>
            </div>
        `);
    }
});

// ----------------------------------------------------
// Fungsi Bantuan: Cari Trailer YouTube dari Data TMDB
// ----------------------------------------------------
function getTrailerUrl(tmdbData) {
    if (tmdbData.videos && tmdbData.videos.results && tmdbData.videos.results.length > 0) {
        // Cari video YouTube yang tipe-nya "Trailer"
        const trailer = tmdbData.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
        // Kalau ga ada "Trailer", ambil video YouTube apa aja yang ada (misal Teaser)
        const fallback = tmdbData.videos.results.find(v => v.site === 'YouTube');
        
        const videoKey = trailer ? trailer.key : (fallback ? fallback.key : null);
        return videoKey ? `https://www.youtube.com/watch?v=${videoKey}` : null;
    }
    return null;
}

// ----------------------------------------------------
// 2. ENDPOINT API 1 FILM (DETAIL + TRAILER)
// ----------------------------------------------------
app.get('/api/movie/:tmdb_id', async (req, res) => {
    const tmdbId = req.params.tmdb_id;
    
    try {
        const tmdbAPIKey = process.env.TMDB_API_KEY; 
        // Tambahkan append_to_response=videos untuk narik data trailer sekaligus
        const tmdbURL = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbAPIKey}&language=id-ID&append_to_response=videos`;
        
        const tmdbRes = await axios.get(tmdbURL).catch(() => ({ data: null }));
        const tmdbData = tmdbRes.data;

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
                    sinopsis: tmdbData ? tmdbData.overview : "",
                    trailer_url: tmdbData ? getTrailerUrl(tmdbData) : null // Ambil URL Trailer
                },
                embed_url: `${BACKEND_URL}/embed/${tmdbId}`
            }
        });

    } catch (error) {
        console.error("Error API:", error.message);
        res.status(500).json({ error: "Terjadi kesalahan", detail: error.message });
    }
});

// ----------------------------------------------------
// 3. ENDPOINT API SEMUA FILM (UNTUK FRONTEND GRID) + CACHE + TRAILER
// ----------------------------------------------------
app.get('/api/movies', async (req, res) => {
    try {
        const currentTime = Date.now();

        // 1. Cek apakah cache masih valid (supaya ga nembak TMDB tiap detik)
        if (moviesCache && (currentTime - lastCacheTime < CACHE_DURATION)) {
            console.log("⚡ Mengambil data dari Cache...");
            return res.json({
                status: "success",
                source: "cache",
                total: moviesCache.length,
                data: moviesCache
            });
        }

        console.log("🌐 Mengambil data dari Firebase & TMDB...");

        // 2. Ambil seluruh data JSON dari Firebase lu
        const firebaseURL = `https://movieku-al-default-rtdb.asia-southeast1.firebasedatabase.app/movies.json`;
        const firebaseRes = await axios.get(firebaseURL);
        const dataFirebase = firebaseRes.data;

        if (!dataFirebase) {
            return res.json({ status: "success", data:[] });
        }

        const tmdbAPIKey = process.env.TMDB_API_KEY;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const BACKEND_URL = `${protocol}://${host}`;

        // 3. Ambil semua ID TMDB
        const tmdbIds = Object.keys(dataFirebase);

        // 4. Proses ambil poster & trailer per ID
        const moviesData = await Promise.all(tmdbIds.map(async (id) => {
            try {
                // Jangan lupa append_to_response=videos disini juga!
                const tmdbURL = `https://api.themoviedb.org/3/movie/${id}?api_key=${tmdbAPIKey}&language=id-ID&append_to_response=videos`;
                const tmdbRes = await axios.get(tmdbURL);
                const tmdbData = tmdbRes.data;

                return {
                    id_tmdb: id,
                    judul: tmdbData.title || dataFirebase[id].judul_internal,
                    poster: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : "https://via.placeholder.com/500x750?text=No+Poster",
                    backdrop: tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}` : null,
                    rating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : "N/A",
                    tahun: tmdbData.release_date ? tmdbData.release_date.split("-")[0] : "?",
                    sinopsis: tmdbData.overview || "Belum ada sinopsis.",
                    trailer_url: getTrailerUrl(tmdbData), // Ini Trailer-nya!
                    embed_url: `${BACKEND_URL}/embed/${id}`
                };
            } catch (err) {
                // Fallback kalau ID salah / error TMDB
                return {
                    id_tmdb: id,
                    judul: dataFirebase[id].judul_internal,
                    poster: "https://via.placeholder.com/500x750?text=Error",
                    backdrop: null,
                    rating: "N/A",
                    tahun: "?",
                    sinopsis: "",
                    trailer_url: null,
                    embed_url: `${BACKEND_URL}/embed/${id}`
