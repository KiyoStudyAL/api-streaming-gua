import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { ANIME } from "@consumet/extensions";

const app = express();
app.set('trust proxy', true); 
app.use(cors({ origin: '*', methods:['GET', 'POST', 'OPTIONS'] }));

// 🔥 GANTI KE HIANIME: Karena AnimePahe memblokir IP Render (Cloudflare)
const provider = new ANIME.Hianime();

// 1. API Scraper
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
            // Hianime butuh ID episode langsung
            const watch = await provider.fetchEpisodeSources(decodeURIComponent(id));
            if (!watch || !watch.sources || !watch.sources.length) {
                return res.status(404).json({ sukses: false, pesan: "Sumber video kosong/diblokir" });
            }
            
            // Hianime biasanya punya kualitas 'auto'
            const source = watch.sources.find(s => s.quality === 'auto' || s.quality === 'default' || s.quality === '1080p') || watch.sources[0];
            return res.json({ sukses: true, link: source.url });
        }
        res.status(400).json({ sukses: false, pesan: "Aksi salah" });
    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ sukses: false, detail: error.message });
    }
});

// 2. API Proxy Video
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No URL");

    try {
        const target = new URL(targetUrl);
        const isM3u8 = targetUrl.includes('.m3u8');
        
        // Header Penyamaran
        const customHeaders = { 
            'Referer': target.origin + '/', 
            'Origin': target.origin,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*'
        };

        if (isM3u8) {
            const response = await axios.get(targetUrl, {
                headers: customHeaders,
                responseType: 'text', 
                timeout: 20000 
            });

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const proxyBase = `${protocol}://${req.get('host')}/api/proxy?url=`;
            
            let playlist = response.data;
            playlist = playlist.split('\n').map(line => {
                if (line.startsWith('#EXT-X-KEY:')) {
                    return line.replace(/URI="(.*?)"/, (m, p1) => `URI="${proxyBase}${encodeURIComponent(new URL(p1, targetUrl).href)}"`);
                }
                if (line.startsWith('#') || !line.trim()) return line;
                return `${proxyBase}${encodeURIComponent(new URL(line.trim(), targetUrl).href)}`;
            }).join('\n');
            
            return res.send(playlist);
        } 
        
        // PROXY VIDEO (.ts file) PAKE STREAM biar Render ga drop!
        const streamResponse = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: customHeaders,
            timeout: 20000
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', streamResponse.headers['content-type'] || 'video/MP2T');
        
        streamResponse.data.pipe(res);

    } catch (e) { 
        console.error("Proxy Error:", e.message);
        res.status(500).send("Proxy Error / Terblokir CDN"); 
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`));
