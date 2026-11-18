const express = require('express');
const app = express();

// Render Dashboard -> Environment mein set karein:
// BACKEND_URL=https://sub1.onrender.com (ya https://print1.idprintstudio.shop)
function getServers() {
    const raw = process.env.BACKEND_URLS || process.env.BACKEND_URL || "";
    return raw
        .split(',')
        .map(u => u.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

let currentIndex = 0;

// 1. CORS Headers (Mobile Web, Python Agent, aur Third-Party ke liye safe)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// 2. Render / UptimeRobot Health Check (Master active rahega)
app.get('/ping', (req, res) => res.status(200).send("OK"));

// 3. Lightweight API Endpoint (~300 bytes)
app.get('/get-server', (req, res) => {
    const servers = getServers();
    if (servers.length === 0) {
        return res.status(500).json({ error: "No sub-servers configured in Master Router" });
    }

    const selected = servers[currentIndex % servers.length];
    currentIndex = (currentIndex + 1) % servers.length;

    // Cache roko taaki URL change hote hi client turant update ho sake
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
        server: selected,
        cache_seconds: 300
    });
});

// 4. Instant 307 Redirect (Customer Mobile & Python Direct Hits)
app.use((req, res) => {
    const servers = getServers();
    if (servers.length === 0) {
        return res.status(500).json({ error: "No backend configured in Master Router" });
    }

    // Active backend select karein
    const selected = servers[currentIndex % servers.length];
    currentIndex = (currentIndex + 1) % servers.length;

    // Mobile browser ko redirect cache karne se rokein (Server switch smooth hoga)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    // Direct sub-account par bhejein (Zero data load on Master)
    res.redirect(307, selected + req.originalUrl);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Lightweight Zero-Bandwidth Master Router Active!"));
