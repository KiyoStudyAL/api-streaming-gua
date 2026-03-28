import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { ANIME } from "@consumet/extensions";

const app = express();
app.set('trust proxy', true); 
app.use(cors({ origin: '*', methods:['GET', 'POST', 'OPTIONS'] }));

// 🔥 KITA KUNCI PAKAI ANIMEPAHE (Terbukti jalan di Termux)
const provider = new ANIME.AnimePahe();

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
            
            // Ambil kualitas terbaik
            const source = watch.sources.find(s => s.quality === '1080p' || s.quality === '720p' || s.quality === 'auto') || watch.sources[0];
            return res.json({ sukses: true, link: source.url });
        }
        res.status(400).json({ sukses: false, pesan: "Aksi salah" });
    } catch (error) {
        res.status(500).json({ sukses: false, detail: error.message });
    }
});

app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No URL");

    try {
        // 🔥 Header "Penyamaran" biar server AnimePahe percaya ini request dari browser
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://animepahe.ru/'
        };

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
