const express = require('express');
const https = require('https');
const http = require('http');
const app = express();

const ALL_SERVERS = (process.env.BACKEND_URLS || process.env.BACKEND_URL || "")
    .split(',')
    .map(u => u.trim().replace(/\/+$/, ''))
    .filter(Boolean);

let activeServer = ALL_SERVERS[0] || "";
let serverHealthStatus = {};

// Helper: Kisi bhi server ka /ping check karega (Timeout: 5 seconds)
function pingServer(url) {
    return new Promise((resolve) => {
        try {
            const parsed = new URL(url + "/ping");
            const client = parsed.protocol === 'https:' ? https : http;
            
            const req = client.get(parsed.href, { timeout: 5000 }, (res) => {
                resolve(res.statusCode === 200);
            });
            
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.on('error', () => resolve(false));
        } catch (e) {
            resolve(false);
        }
    });
}

// 🧠 AUTO-FAILOVER ENGINE (Har 60 sec mein check karega)
async function checkAndFailover() {
    if (ALL_SERVERS.length === 0) return;

    // 1. Current active server ko check karo
    const isCurrentAlive = await pingServer(activeServer);
    serverHealthStatus[activeServer] = isCurrentAlive ? "ONLINE" : "OFFLINE";

    if (isCurrentAlive) {
        return; // Sab sahi chal raha hai, switch karne ki zaroorat nahi
    }

    console.log(`⚠️ Alert: Active server ${activeServer} is DOWN / SUSPENDED! Searching backup...`);

    // 2. Agar active server down hai, toh list mein se pehla healthy server dhoondo
    for (const server of ALL_SERVERS) {
        const alive = await pingServer(server);
        serverHealthStatus[server] = alive ? "ONLINE" : "OFFLINE";
        
        if (alive) {
            console.log(`✅ [AUTO-SWITCH SUCCESS] New Active Server: ${server}`);
            activeServer = server;
            return;
        }
    }

    console.error("🚨 CRITICAL: Saare sub-servers down ya suspend hain!");
}

// Background monitoring start (Har 60 seconds)
setInterval(checkAndFailover, 60000);
// Server start hote hi pehla check turant kare
setTimeout(checkAndFailover, 3000);

// =========================================================================
// MIDDLEWARES & ROUTES
// =========================================================================

// CORS Headers
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Health check for Master itself
app.get('/ping', (req, res) => res.status(200).send("OK"));

// 📊 Live Status Page (Aap browser mein https://quickprint.idprintstudio.shop/status khol kar live dekh sakte hain)
app.get('/status', (req, res) => {
    res.json({
        active_server: activeServer,
        all_servers: serverHealthStatus,
        last_checked: new Date().toISOString()
    });
});

// Discovery Endpoint (Python Desktop Agent ke liye)
app.get('/get-server', (req, res) => {
    if (!activeServer) {
        return res.status(502).json({ error: "No healthy backend server available" });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ server: activeServer, cache_seconds: 60 });
});

// ⚡ 307 Dynamic Redirection (Customer QR & Web Traffic)
app.use((req, res) => {
    if (!activeServer) {
        return res.status(502).send("All Print Servers are currently offline. Please contact admin.");
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.redirect(307, activeServer + req.originalUrl);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Automated Master Router running on port ${PORT}`);
    console.log(`Managed Servers: ${ALL_SERVERS.join(', ')}`);
});
