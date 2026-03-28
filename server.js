import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { ANIME } from "@consumet/extensions";

const app = express();

// Konfigurasi untuk Render & CORS
app.set('trust proxy', true); 
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));

const provider = new ANIME.AnimeKai();

// ==========================================
// 1. ENDPOINT ANIME (Scraper)
// ==========================================
app.get('/api/anime', async (req, res) => {
    const action = req.query.action;
    
    try {
        if (action === 'search') {
            const q = req.query.q;
            const result = await provider.search(q);
            return res.json({ sukses: true, data: result.results });
        }
        
        if (action === 'info') {
            const id = req.query.id;
            const info = await provider.fetchAnimeInfo(id);
            return res.json({ sukses: true, data: info });
        }
        
        if (action === 'watch') {
            const rawId = req.query.id;
            const id = decodeURIComponent(rawId);
            const watch = await provider.fetchEpisodeSources(id);
            
            if (!watch || !watch.sources || watch.sources.length === 0) {
                return res.status(404).json({ sukses: false, pesan: "Stream tidak ditemukan." });
            }
            
            const defaultSource = watch.sources.find(s => s.quality === 'auto' || s.quality === 'default') || watch.sources[0];
            return res.json({ sukses: true, link: defaultSource.url });
        }
        
        return res.status(400).json({ sukses: false, pesan: "Aksi tidak dikenali" });
        
    } catch (error) {
        console.error("API Error:", error.message);
        return res.status(500).json({ sukses: false, detail: error.message });
    }
});

// ==========================================
// 2. ENDPOINT PROXY (Video Player)
// ==========================================
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No URL provided");

    try {
        const target = new URL(targetUrl);
        const headers = { 
            'Referer': target.origin + '/', 
            'Origin': target.origin,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        const response = await axios.get(targetUrl, {
            headers: headers,
            responseType: 'arraybuffer',
            timeout: 20000 
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        const contentType = response.headers['content-type'] || 'application/vnd.apple.mpegurl';
        res.setHeader('Content-Type', contentType);

        const isM3u8 = targetUrl.includes('.m3u8') || contentType.toLowerCase().includes('mpegurl');

        if (isM3u8) {
            const proxyBase = `${req.protocol}://${req.get('host')}/api/proxy?url=`;
            let playlist = Buffer.from(response.data).toString('utf8');
            
            playlist = playlist.split('\n').map(line => {
                if (line.startsWith('#EXT-X-KEY:')) {
                    return line.replace(/URI="(.*?)"/, (match, p1) => {
                        const absUrl = new URL(p1, targetUrl).href;
                        return `URI="${proxyBase}${encodeURIComponent(absUrl)}"`;
                    });
                }
                if (line.startsWith('#') || !line.trim()) return line;
                
                const absUrl = new URL(line.trim(), targetUrl).href;
                return `${proxyBase}${encodeURIComponent(absUrl)}`;
            }).join('\n');
            
            return res.send(playlist);
        }
        
        return res.send(response.data);
        
    } catch (error) {
        console.error("Proxy Error:", error.message);
        return res.status(500).send("Proxy Gagal");
    }
});

// ==========================================
// 3. JALANKAN SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API Server AnimeKu berjalan di port ${PORT}`);
});
