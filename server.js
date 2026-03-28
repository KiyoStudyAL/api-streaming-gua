import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { ANIME } from "@consumet/extensions";
import apicache from 'apicache'; // Tambahkan apicache

const app = express();
app.set('trust proxy', true); 
app.use(cors({ origin: '*', methods:['GET', 'POST', 'OPTIONS'] }));

// Setup Cache (simpan data 5 menit agar server tidak capek scrape terus)
const cache = apicache.middleware;

const provider = new ANIME.AnimeKai();

// 1. API Scraper (Gunakan Cache 5 Menit di sini)
app.get('/api/anime', cache('5 minutes'), async (req, res) => {
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
            if (!watch || !watch.sources.length) return res.status(404).json({ sukses: false });
            const source = watch.sources.find(s => s.quality === 'auto' || s.quality === 'default') || watch.sources[0];
            return res.json({ sukses: true, link: source.url });
        }
        res.status(400).json({ sukses: false, pesan: "Aksi salah" });
    } catch (error) {
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

        // Jika M3U8, kita ambil teksnya untuk dimodifikasi
        if (isM3u8) {
            const response = await axios.get(targetUrl, {
                headers: { 'Referer': target.origin + '/', 'User-Agent': 'Mozilla/5.0' },
                responseType: 'arraybuffer',
                timeout: 20000 
            });

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', response.headers['content-type'] || 'application/vnd.apple.mpegurl');

            const proxyBase = `${req.protocol}://${req.get('host')}/api/proxy?url=`;
            let playlist = Buffer.from(response.data).toString('utf8');
            playlist = playlist.split('\n').map(line => {
                if (line.startsWith('#EXT-X-KEY:')) {
                    return line.replace(/URI="(.*?)"/, (m, p1) => `URI="${proxyBase}${encodeURIComponent(new URL(p1, targetUrl).href)}"`);
                }
                if (line.startsWith('#') || !line.trim()) return line;
                return `${proxyBase}${encodeURIComponent(new URL(line.trim(), targetUrl).href)}`;
            }).join('\n');
            
            return res.send(playlist);
        } 
        
        // JIKA BUKAN M3U8 (.ts video segments), GUNAKAN STREAM AGAR RAM AMAN!
        const streamResponse = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream', // Penting: Ini tidak akan membebani RAM Server
            headers: { 'Referer': target.origin + '/', 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', streamResponse.headers['content-type'] || 'video/MP2T');
        
        // Langsung alirkan (pipe) dari sumber ke penonton
        streamResponse.data.pipe(res);

    } catch (e) { 
        res.status(500).send("Proxy Error"); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`));
