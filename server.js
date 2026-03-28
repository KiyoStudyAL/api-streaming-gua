import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { ANIME } from "@consumet/extensions";

const app = express();

// Kepercayaan penuh buat HTTPS dari Render
app.set('trust proxy', true); 

// CORS dibuka lebar untuk Netlify
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
            // Decode URI dua kali untuk memastikan simbol aneh aman
            const id = decodeURIComponent(rawId);
            
            const watch = await provider.fetchEpisodeSources(id);
            
            if (!watch || !watch.sources || watch.sources.length === 0) {
                return res.status(404).json({ sukses: false, pesan: "Stream tidak ditemukan di server asal." });
            }
            
            // Prioritaskan kualitas 'auto' atau ambil yang pertama
            const defaultSource = watch.sources.find(s => s.quality === 'auto' || s.quality === 'default') || watch.sources[0];
            
            return res.json({ sukses: true, link: defaultSource.url });
        }
        
        return res.status(400).json({ sukses: false, pesan: "Aksi tidak dikenali" });
        
    } catch (error) {
        console.error("API Error pada action", action, ":", error.message);
        // Ngasih tau error aslinya ke Frontend biar gampang di-debug
        return res.status(500).json({ 
            sukses: false, 
            pesan: "Error dari server penyedia Anime.",
            detail: error.message 
        });
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
        
        // Header Penyamaran Super (Anti Blokir)
        const headers = { 
            'Referer': target.origin + '/', 
            'Origin': target.origin,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
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
                // Eksekusi Kunci Enkripsi
                if (line.startsWith('#EXT-X-KEY:')) {
                    return line.replace(/URI="(.*?)"/, (match, p1) => {
                        const absUrl = new URL(p1, targetUrl).href;
                        return `URI="${proxyBase}${encodeURIComponent(absUrl)}"`;
                    });
                }
                if (line.startsWith('#') || !line.trim()) return line;
                
                // Ganti URL Segment File (.ts)
                const absUrl = new URL(line.trim(), targetUrl).href;
                return `${proxyBase}${encodeURIComponent(absUrl)}`;
            }).join('\n');
            
            return res.send(playlist);
        }
        
        return res.send(response.data);
        
    } catch (error) {
        console.error("Proxy Error untuk URL:", targetUrl);
        if (error.response) {
            console.error("Status Ditolak Server:", error.response.status);
            return res.status(error.response.status).send(`Proxy Ditolak Server Asli: Error ${error.response.status}`);
        }
        return res.status(500).send("Proxy Request Timeout/Gagal");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API Server berjalan di port ${PORT}`);
});            playlist = playlist.split('\n').map(line => {
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
