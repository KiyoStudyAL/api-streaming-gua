import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { ANIME } from "@consumet/extensions";

const app = express();
app.set('trust proxy', true); 
app.use(cors({ origin: '*', methods:['GET', 'POST', 'OPTIONS'] }));

// 🔥 GANTI KE ANIMEKAI (Lebih ramah sama Server Render)
const provider = new ANIME.AnimeKai();

app.get('/api/anime', async (req, res) => {
    const { action, q, id } = req.query;
    try {
        if (action === 'search') {
            const result = await provider.search(q);
            return res.json({ sukses: true, data: result.results });
        }
        if (action === 'info') {
            const info = await provider.fetchAnimeInfo(id);
            return res.json({ sukses: true, data: info });
        }
        if (action === 'watch') {
            const watch = await provider.fetchEpisodeSources(decodeURIComponent(id));
            if (!watch || !watch.sources || !watch.sources.length) return res.status(404).json({ sukses: false });
            
            const source = watch.sources.find(s => s.quality === 'auto' || s.quality === 'default') || watch.sources[0];
            return res.json({ sukses: true, link: source.url });
        }
        res.status(400).json({ sukses: false, pesan: "Aksi salah" });
    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ sukses: false, detail: error.message });
    }
});

app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No URL");

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': new URL(targetUrl).origin + '/'
        };

        // Modifikasi Playlist M3U8
        if (targetUrl.includes('.m3u8')) {
            const response = await axios.get(targetUrl, { headers, responseType: 'text' });
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            
            const proxyBase = `${req.headers['x-forwarded-proto'] || 'https'}://${req.get('host')}/api/proxy?url=`;
            let playlist = response.data.split('\n').map(line => {
                if (line.startsWith('#EXT-X-KEY:')) return line.replace(/URI="(.*?)"/, (m, p1) => `URI="${proxyBase}${encodeURIComponent(new URL(p1, targetUrl).href)}"`);
                if (line.startsWith('#') || !line.trim()) return line;
                return `${proxyBase}${encodeURIComponent(new URL(line.trim(), targetUrl).href)}`;
            }).join('\n');
            return res.send(playlist);
        }

        // Streaming Video (.ts)
        const response = await axios.get(targetUrl, { headers, responseType: 'stream' });
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', response.headers['content-type'] || 'video/MP2T');
        response.data.pipe(res);
    } catch (e) { 
        res.status(500).send("Proxy Error"); 
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`));
