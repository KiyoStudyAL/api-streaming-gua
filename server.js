import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { META } from "@consumet/extensions";
import apicache from 'apicache';

const app = express();
app.use(cors());

// Serve folder public untuk frontend (UI)
app.use(express.static('public'));

// Gunakan META Anilist (Ini otomatis nge-map ID Anilist lu ke Gogoanime/Zoro)
const anilistProvider = new META.Anilist(); 
const cache = apicache.middleware;

const HEADERS = {
    'Referer': 'https://gogoanime.hd/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// 1. Get Episodes by AniList ID
app.get('/api/episodes/:anilistId', cache('1 hours'), async (req, res) => {
    try {
        const { anilistId } = req.params;
        const info = await anilistProvider.fetchAnimeInfo(anilistId);
        
        if (!info || !info.episodes) {
            return res.status(404).json({ success: false, message: "Episode tidak ditemukan" });
        }

        res.json({ success: true, episodes: info.episodes });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 2. Get Video Sources (M3U8) by Episode ID
app.get('/api/sources/:episodeId', cache('1 hours'), async (req, res) => {
    try {
        const { episodeId } = req.params;
        const watch = await anilistProvider.fetchEpisodeSources(episodeId);
        
        if (!watch || !watch.sources?.length) {
            return res.status(404).json({ success: false, message: "Video source not found" });
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        res.json({
            success: true,
            sources: watch.sources.map(s => ({
                quality: s.quality,
                url: s.url,
                // URL Proxy yang langsung bisa dicolok ke HLS.js di frontend
                proxyUrl: `${baseUrl}/proxy?url=${encodeURIComponent(s.url)}`,
                isM3U8: s.url.includes('.m3u8')
            }))
        });
        
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 3. PROXY SERVER (Bypass CORS & Rewrite Playlist HLS)
app.get('/proxy', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: "URL parameter required" });

        const response = await axios.get(url, { 
            headers: HEADERS, 
            responseType: 'arraybuffer',
            timeout: 15000 
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        const contentType = response.headers['content-type'] || 'application/vnd.apple.mpegurl';
        res.setHeader('Content-Type', contentType);
        
        const isM3u8 = url.includes('.m3u8') || contentType.includes('mpegurl');

        if (isM3u8) {
            const baseUrl = `${req.protocol}://${req.get('host')}/proxy?url=`;
            let playlist = response.data.toString('utf8');
            
            playlist = playlist.split('\n').map(line => {
                // Rewrite Key URL (buat video yang dienkripsi AES)
                if (line.startsWith('#EXT-X-KEY:')) {
                    return line.replace(/URI="(.*?)"/, (match, p1) => {
                        return `URI="${baseUrl}${encodeURIComponent(new URL(p1, url).href)}"`;
                    });
                }
                // Abaikan tag m3u8 dan baris kosong
                if (line.startsWith('#') || !line.trim()) return line;
                
                // Rewrite Chunk .ts URL biar lewat proxy juga
                return `${baseUrl}${encodeURIComponent(new URL(line.trim(), url).href)}`;
            }).join('\n');
            
            res.send(playlist);
        } else {
            // Kalau file .ts biasa, langsung kirim buffer-nya
            res.send(response.data);
        }
    } catch (e) {
        console.error("Proxy Error:", e.message);
        res.status(500).send("Proxy failed");
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(` API Backend & Proxy jalan di http://localhost:${PORT}`);
});