import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { ANIME } from "@consumet/extensions";

const app = express();

// WAJIB ditambahin ini biar Render tau dia jalan di HTTPS
app.set('trust proxy', true); 

// Aktifkan CORS untuk semua domain (Biar Netlify lu bebas akses)
app.use(cors({
    origin: '*',
    methods:['GET', 'POST', 'OPTIONS'],
}));

// Gunakan provider AnimeKai sesuai permintaan lu
const provider = new ANIME.AnimeKai();

// ==========================================
// 1. ENDPOINT UTAMA (Pencarian, Info, Link Video)
// ==========================================
app.get('/api/anime', async (req, res) => {
    const action = req.query.action;
    
    try {
        if (action === 'search') {
            const q = req.query.q;
            if (!q) return res.status(400).json({ sukses: false, pesan: "Kata kunci kosong" });
            const result = await provider.search(q);
            return res.json({ sukses: true, data: result.results });
        }
        
        if (action === 'info') {
            const id = req.query.id;
            if (!id) return res.status(400).json({ sukses: false, pesan: "ID Anime kosong" });
            const info = await provider.fetchAnimeInfo(id);
            return res.json({ sukses: true, data: info });
        }
        
        if (action === 'watch') {
            const id = req.query.id;
            if (!id) return res.status(400).json({ sukses: false, pesan: "ID Episode kosong" });
            const watch = await provider.fetchEpisodeSources(id);
            
            if (!watch.sources || watch.sources.length === 0) {
                return res.status(404).json({ sukses: false, pesan: "Stream tidak tersedia saat ini" });
            }
            // Kirim link video resolusi tertinggi/default (index 0)
            return res.json({ sukses: true, link: watch.sources[0].url });
        }
        
        return res.status(400).json({ sukses: false, pesan: "Aksi tidak dikenali" });
        
    } catch (error) {
        console.error("Anime API Error:", error.message);
        return res.status(500).json({ sukses: false, pesan: "Terjadi kesalahan server internal." });
    }
});

// ==========================================
// 2. ENDPOINT PROXY (Bypass CORS & Rewrite M3U8)
// ==========================================
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No URL provided");

    try {
        // Ambil origin asli untuk menyamar (Bypass proteksi 403 Forbidden)
        const targetOrigin = new URL(targetUrl).origin;

        const response = await axios.get(targetUrl, {
            headers: { 
                'Referer': targetOrigin,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            responseType: 'arraybuffer',
            timeout: 20000 // Timeout 20 detik (Render kadang butuh waktu)
        });

        // Set Headers untuk balasan ke frontend lu
        const contentType = response.headers['content-type'] || 'application/vnd.apple.mpegurl';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Cek apakah ini file playlist M3U8
        const isM3u8 = targetUrl.includes('.m3u8') || contentType.includes('mpegurl');

        if (isM3u8) {
            // Deteksi link Render lu otomatis untuk bikin URL proxy
            const protocol = req.protocol; // akan otomatis jadi 'https' di Render
            const host = req.get('host');
            const proxyEndpoint = `${protocol}://${host}/api/proxy?url=`;

            let playlist = Buffer.from(response.data).toString('utf8');
            
            playlist = playlist.split('\n').map(line => {
                // 1. Rewrite URL kunci enkripsi (Jika ada)
                if (line.startsWith('#EXT-X-KEY:')) {
                    return line.replace(/URI="(.*?)"/, (match, p1) => {
                        const absoluteKeyUrl = new URL(p1, targetUrl).href;
                        return `URI="${proxyEndpoint}${encodeURIComponent(absoluteKeyUrl)}"`;
                    });
                }
                
                // Jangan ubah tag bawaan HLS
                if (line.startsWith('#') || !line.trim()) return line;
                
                // 2. Rewrite link file video (.ts) biar lewat proxy
                const absoluteUrl = new URL(line.trim(), targetUrl).href;
                return `${proxyEndpoint}${encodeURIComponent(absoluteUrl)}`;
            }).join('\n');
            
            return res.send(playlist);
        }
        
        // Kalau yang diminta file video (.ts) / gambar, langsung teruskan data buffer-nya
        return res.send(response.data);
        
    } catch (error) {
        console.error("Proxy Error fetching:", targetUrl, error.message);
        return res.status(500).send("Proxy Error");
    }
});

// ==========================================
// 3. JALANKAN SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API Server AnimeKu berjalan di port ${PORT}`);
});
