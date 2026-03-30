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
    res.send(`
        <div style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#0f0f0f; color:white; font-family:sans-serif;">
            <h1>🚀 API Streaming Aktif & Siap Digunakan!</h1>
        </div>
    `);
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
            return res.status(404).send(`
                <div style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#000; color:#fff; font-family:sans-serif;">
                    <h2>Oopss! Video belum tersedia 🎬</h2>
                </div>
            `);
        }

        // Cek apakah video_path pakai absolute URL atau relative URL
        let videoStreamUrl = dataFirebase.video_path;
        if (!videoStreamUrl.startsWith('http')) {
            videoStreamUrl = `https://${CLOUDFLARE_DOMAIN}${videoStreamUrl}`;
        }

        // Cek juga URL subtitle untuk mencegah double https
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

        // Render HTML Player (Dengan Upgrade Resolusi & HLS Recovery)
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
                :root { 
                    --plyr-color-main: #e50914; /* Warna merah Netflix */
                    --plyr-video-control-color-hover: #fff;
                }
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
                    
                    // Settingan Default Plyr yang sudah di-upgrade
                    const defaultOptions = {
                        captions: { active: true, update: true, language: 'id' },
                        controls:['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
                        settings: ['captions', 'quality', 'speed'],
                        speed: { selected: 1, options:[0.5, 0.75, 1, 1.25, 1.5, 2] }
                    };

                    if (Hls.isSupported()) {
                        const hls = new Hls();
                        hls.loadSource(source);
                        hls.attachMedia(video);

                        // [UPGRADE] Mengawinkan Resolusi HLS dengan Plyr
                        hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                            
                            // Ambil list resolusi dari m3u8 (contoh: 1080, 720, 480)
                            const availableQualities = hls.levels.map((l) => l.height);
                            availableQualities.unshift(0); // Tambah angka 0 untuk opsi "Auto"

                            // Masukkan list resolusi ke pengaturan Plyr
                            defaultOptions.quality = {
                                default: 0, // Set Auto sebagai default
                                options: availableQualities,
                                forced: true,
                                onChange: (newQuality) => {
                                    if (newQuality === 0) {
                                        hls.currentLevel = -1; // -1 di HLS.js artinya Auto
                                    } else {
                                        hls.levels.forEach((level, levelIndex) => {
                                            if (level.height === newQuality) {
                                                hls.currentLevel = levelIndex; // Ganti ke resolusi yang dipilih
                                            }
                                        });
                                    }
                                }
                            };

                            // Ubah teks angka "0" menjadi tulisan "Auto" di menu gear
                            defaultOptions.i18n = {
                                qualityLabel: { 0: 'Auto' }
                            };

                            // Render Plyr setelah resolusi disuntikkan
                            const player = new Plyr(video, defaultOptions);
                        });

                        // [UPGRADE] Auto-Recovery jika jaringan penonton lemot/error
                        hls.on(Hls.Events.ERROR, function (event, data) {
                            if (data.fatal) {
                                switch (data.type) {
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        console.warn("HLS: Jaringan putus, mencoba menyambung ulang...");
                                        hls.startLoad();
                                        break;
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        console.warn("HLS: Media error, memulihkan...");
                                        hls.recoverMediaError();
                                        break;
                                    default:
                                        hls.destroy();
                                        break;
                                }
                            }
                        });

                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        // Khusus browser Safari (iOS/Mac) yang sudah mendukung HLS secara native
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
        res.status(500).send(`
            <div style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#000; color:#fff; font-family:sans-serif;">
                <h2>Terjadi kesalahan server internal 🛠️</h2>
            </div>
        `);
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

        // Bikin URL Backend dinamis
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
