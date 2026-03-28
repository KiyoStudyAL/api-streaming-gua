import express from 'express';
import axios from 'axios';
import { ANIME } from "@consumet/extensions";

const app = express();
const PORT = process.env.PORT || 3000;

const provider = new ANIME.AnimeKai();

// Header untuk bypass Cloudflare
const VIP_HEADERS = {
    'Referer': 'https://megaup.nl/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// =========================================
// MIDDLEWARE
// =========================================
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// =========================================
// 1. API ENDPOINTS
// =========================================
app.get('/api/search', async (req, res) => {
    try {
        if (!req.query.judul) return res.json({ sukses: false, pesan: "Judul tidak boleh kosong." });
        const search = await provider.search(req.query.judul);
        res.json({ sukses: true, data: search.results || [] });
    } catch (e) {
        console.error('[/api/search]', e.message);
        res.json({ sukses: false, pesan: e.message });
    }
});

app.get('/api/info', async (req, res) => {
    try {
        if (!req.query.id) return res.json({ sukses: false, pesan: "ID Anime dibutuhkan." });
        const info = await provider.fetchAnimeInfo(req.query.id);
        res.json({ sukses: true, data: info });
    } catch (e) {
        console.error('[/api/info]', e.message);
        res.json({ sukses: false, pesan: e.message });
    }
});

app.get('/api/watch', async (req, res) => {
    try {
        if (!req.query.eps_id) return res.json({ sukses: false, pesan: "eps_id tidak boleh kosong." });

        const watch = await provider.fetchEpisodeSources(req.query.eps_id);

        if (!watch || !watch.sources || watch.sources.length === 0) {
            return res.json({ sukses: false, pesan: "Link video tidak tersedia saat ini." });
        }

        const selectedSource = watch.sources.find(s => s.quality === 'auto') || watch.sources[0];
        res.json({ sukses: true, link: selectedSource.url, semua: watch.sources });
    } catch (e) {
        console.error('[/api/watch]', e.message);
        res.json({ sukses: false, pesan: e.message });
    }
});

// =========================================
// 2. PROXY (Anti-Blokir HLS)
// =========================================
app.get('/proxy', async (req, res) => {
    try {
        const targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send("URL required");

        const response = await axios.get(targetUrl, {
            headers: VIP_HEADERS,
            responseType: 'arraybuffer',
            timeout: 10000
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/vnd.apple.mpegurl');

        const isM3u8 = targetUrl.includes('.m3u8') ||
            (response.headers['content-type'] && response.headers['content-type'].includes('mpegurl'));

        if (isM3u8) {
            const baseUrl = `${req.protocol}://${req.get('host')}/proxy?url=`;
            let playlist = response.data.toString('utf8');

            playlist = playlist.split('\n').map(line => {
                if (line.startsWith('#EXT-X-KEY:')) {
                    return line.replace(/URI="(.*?)"/, (match, p1) => {
                        return `URI="${baseUrl}${encodeURIComponent(new URL(p1, targetUrl).href)}"`;
                    });
                }
                if (line.startsWith('#') || !line.trim()) return line;
                return `${baseUrl}${encodeURIComponent(new URL(line.trim(), targetUrl).href)}`;
            }).join('\n');

            res.send(playlist);
        } else {
            res.send(response.data);
        }
    } catch (e) {
        console.error('[/proxy]', e.message);
        res.status(500).send(`Proxy Error: ${e.message}`);
    }
});

// =========================================
// 3. FRONTEND HTML
// =========================================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AnimeKu Streaming</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            :root {
                --red: #e50914;
                --red-dim: rgba(229,9,20,0.15);
                --bg: #0d0d0f;
                --surface: #18181c;
                --surface2: #222228;
                --border: rgba(255,255,255,0.07);
                --text: #f0f0f0;
                --muted: #888;
                --radius: 10px;
            }

            body {
                font-family: 'Inter', sans-serif;
                background: var(--bg);
                color: var(--text);
                min-height: 100vh;
            }

            header {
                background: linear-gradient(135deg, #1a0005 0%, #0d0d0f 60%);
                border-bottom: 1px solid var(--border);
                padding: 16px 24px;
                display: flex;
                align-items: center;
                gap: 12px;
                position: sticky;
                top: 0;
                z-index: 100;
                backdrop-filter: blur(10px);
            }

            header .logo {
                font-family: 'Rajdhani', sans-serif;
                font-size: 26px;
                font-weight: 700;
                color: var(--red);
                letter-spacing: 1px;
            }

            header .logo span { color: var(--text); }

            .container { max-width: 860px; margin: 0 auto; padding: 24px 16px; }

            /* Player */
            #player-container {
                display: none;
                background: #000;
                border-radius: var(--radius);
                overflow: hidden;
                margin-bottom: 24px;
                border: 1px solid var(--border);
                box-shadow: 0 8px 40px rgba(229,9,20,0.2);
            }
            video { width: 100%; aspect-ratio: 16/9; display: block; outline: none; }
            #kualitas {
                padding: 10px 16px;
                background: var(--surface);
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                color: var(--muted);
                flex-wrap: wrap;
            }
            #kualitas-btn button {
                background: var(--surface2);
                color: var(--text);
                border: 1px solid var(--border);
                padding: 4px 12px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 12px;
                margin-left: 4px;
                transition: background 0.2s;
            }
            #kualitas-btn button:hover { background: var(--red); border-color: var(--red); }

            /* Judul */
            #judul-tayang {
                font-family: 'Rajdhani', sans-serif;
                font-size: 22px;
                font-weight: 700;
                margin-bottom: 16px;
                display: none;
                color: var(--text);
                border-left: 3px solid var(--red);
                padding-left: 12px;
            }

            /* Search */
            .search-box {
                display: flex;
                gap: 10px;
                margin-bottom: 24px;
            }
            input[type="text"] {
                flex: 1;
                padding: 12px 16px;
                border-radius: var(--radius);
                border: 1px solid var(--border);
                background: var(--surface);
                color: var(--text);
                font-size: 15px;
                font-family: 'Inter', sans-serif;
                outline: none;
                transition: border-color 0.2s;
            }
            input[type="text"]:focus { border-color: var(--red); }
            input[type="text"]::placeholder { color: var(--muted); }

            button.btn-cari {
                background: var(--red);
                color: white;
                border: none;
                padding: 12px 22px;
                border-radius: var(--radius);
                cursor: pointer;
                font-weight: 600;
                font-size: 15px;
                font-family: 'Inter', sans-serif;
                transition: opacity 0.2s;
                white-space: nowrap;
            }
            button.btn-cari:hover { opacity: 0.85; }

            /* Loading */
            #loading {
                display: none;
                text-align: center;
                color: var(--muted);
                margin: 32px 0;
                font-size: 14px;
                letter-spacing: 1px;
            }

            /* Grid Hasil */
            .hasil-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                gap: 14px;
            }
            .anime-card {
                background: var(--surface);
                border-radius: var(--radius);
                cursor: pointer;
                border: 1px solid var(--border);
                overflow: hidden;
                transition: transform 0.2s, border-color 0.2s;
            }
            .anime-card:hover { transform: translateY(-4px); border-color: var(--red); }
            .anime-card img {
                width: 100%;
                aspect-ratio: 2/3;
                object-fit: cover;
                display: block;
                background: var(--surface2);
            }
            .anime-card .card-title {
                padding: 8px;
                font-size: 12px;
                line-height: 1.4;
                color: var(--text);
            }

            /* Grid Episode */
            .eps-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .eps-btn {
                background: var(--surface);
                border: 1px solid var(--border);
                padding: 8px 14px;
                border-radius: 7px;
                cursor: pointer;
                font-size: 13px;
                transition: background 0.2s, border-color 0.2s;
                color: var(--text);
            }
            .eps-btn:hover { background: var(--surface2); }
            .eps-btn.active { background: var(--red); border-color: var(--red); font-weight: 600; }

            @media (max-width: 480px) {
                .hasil-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
            }
        </style>
    </head>
    <body>

        <header>
            <div class="logo">ANIME<span>KU</span></div>
        </header>

        <div class="container">

            <div id="player-container">
                <video id="video-player" controls autoplay playsinline></video>
                <div id="kualitas">Resolusi: <span id="kualitas-btn"></span></div>
            </div>

            <div id="judul-tayang"></div>

            <div class="search-box">
                <input type="text" id="input-cari" placeholder="Cari anime... (misal: Oshi no Ko)" onkeydown="if(event.key==='Enter') cariAnime()">
                <button class="btn-cari" onclick="cariAnime()">Cari</button>
            </div>

            <div id="loading">⏳ Memuat...</div>
            <div id="konten-utama" class="hasil-grid"></div>

        </div>

        <script>
            const konten = document.getElementById('konten-utama');
            const loading = document.getElementById('loading');
            const player = document.getElementById('player-container');
            const video = document.getElementById('video-player');
            const judulTayang = document.getElementById('judul-tayang');
            var hls = null;

            async function cariAnime() {
                const query = document.getElementById('input-cari').value.trim();
                if (!query) return alert("Ketik judulnya dulu!");

                player.style.display = 'none';
                judulTayang.style.display = 'none';
                loading.style.display = 'block';
                konten.innerHTML = '';
                konten.className = 'hasil-grid';

                try {
                    const res = await fetch('/api/search?judul=' + encodeURIComponent(query));
                    const data = await res.json();
                    loading.style.display = 'none';

                    if (data.sukses && data.data.length > 0) {
                        data.data.forEach(anime => {
                            const title = typeof anime.title === 'string'
                                ? anime.title
                                : (anime.title?.english || anime.title?.romaji || "Tanpa Judul");
                            const card = document.createElement('div');
                            card.className = 'anime-card';
                            card.innerHTML = \`
                                <img src="\${anime.image || ''}" alt="poster" loading="lazy" onerror="this.style.display='none'">
                                <div class="card-title">\${title}</div>
                            \`;
                            card.onclick = () => bukaAnime(anime.id, title);
                            konten.appendChild(card);
                        });
                    } else {
                        konten.innerHTML = '<p style="color:#888">Anime tidak ditemukan.</p>';
                    }
                } catch (e) {
                    loading.style.display = 'none';
                    alert("Gagal menghubungi server.");
                }
            }

            async function bukaAnime(id, title) {
                loading.style.display = 'block';
                konten.innerHTML = '';
                konten.className = 'eps-grid';
                judulTayang.style.display = 'block';
                judulTayang.innerText = "📺 " + title;

                try {
                    const res = await fetch('/api/info?id=' + encodeURIComponent(id));
                    const data = await res.json();
                    loading.style.display = 'none';

                    if (data.sukses && data.data.episodes && data.data.episodes.length > 0) {
                        data.data.episodes.forEach(eps => {
                            const btn = document.createElement('div');
                            btn.className = 'eps-btn';
                            btn.innerText = 'Eps ' + eps.number;
                            btn.onclick = () => nontonEps(eps.id, btn);
                            konten.appendChild(btn);
                        });
                    } else {
                        konten.innerHTML = '<p style="color:#888">Belum ada daftar episode.</p>';
                    }
                } catch (e) {
                    loading.style.display = 'none';
                    alert("Gagal mengambil episode.");
                }
            }

            async function nontonEps(eps_id, btnElement) {
                document.querySelectorAll('.eps-btn').forEach(b => b.classList.remove('active'));
                btnElement.classList.add('active');
                loading.style.display = 'block';

                try {
                    const res = await fetch('/api/watch?eps_id=' + encodeURIComponent(eps_id));
                    const data = await res.json();
                    loading.style.display = 'none';

                    if (data.sukses) {
                        player.style.display = 'block';
                        const proxyUrl = '/proxy?url=' + encodeURIComponent(data.link);

                        if (hls) hls.destroy();

                        if (Hls.isSupported()) {
                            hls = new Hls({ autoStartLoad: true });
                            hls.loadSource(proxyUrl);
                            hls.attachMedia(video);

                            hls.on(Hls.Events.MANIFEST_PARSED, function () {
                                const btnBox = document.getElementById('kualitas-btn');
                                btnBox.innerHTML = '';
                                if (hls.levels.length > 1) {
                                    hls.levels.forEach((lvl, index) => {
                                        const b = document.createElement('button');
                                        b.innerText = lvl.height + 'p';
                                        b.onclick = () => { hls.currentLevel = index; };
                                        btnBox.appendChild(b);
                                    });
                                } else {
                                    btnBox.innerHTML = '<span>Otomatis</span>';
                                }
                            });

                            video.play();
                            window.scrollTo({ top: 0, behavior: 'smooth' });

                        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                            video.src = proxyUrl;
                            video.play();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            document.getElementById('kualitas-btn').innerHTML = '<span>Otomatis (iOS)</span>';
                        }
                    } else {
                        alert("Error: " + data.pesan);
                    }
                } catch (e) {
                    loading.style.display = 'none';
                    alert("Terjadi kesalahan saat memuat video.");
                }
            }
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 ANIMEKU STREAMING JALAN DI PORT ${PORT}`);
    console.log(`========================================`);
    console.log(`➡️  http://localhost:${PORT}/`);
    console.log(`========================================\n`);
});
