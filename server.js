const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const app = express();

const servers = [
    "https://qr-print-1.onrender.com",
    "https://qr-print-2.onrender.com",
    "https://qr-print-3.onrender.com",
    "https://qr-print-4.onrender.com"
];

let activeServer = servers[0];
let isScanning = false;

// High-Performance Keep-Alive Agent (ConnectionReset 10054 ko rokne ke liye)
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 100,
    timeout: 6000
});

// Single Server Checker
function checkServer(serverUrl) {
    return new Promise((resolve) => {
        const u = new URL(serverUrl + '/ping');
        const req = https.get(u, { agent: httpsAgent, timeout: 2000 }, (res) => {
            if (res.statusCode === 200) {
                resolve(serverUrl);
            } else {
                resolve(null);
            }
            res.resume(); // consume memory
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

// Parallel Scanner (Sirf tabhi chalega jab server fail ho ya start ho)
async function findActiveServer() {
    if (isScanning) return;
    isScanning = true;
    console.log("[ROUTER] Scanning for the active server...");
    try {
        const results = await Promise.all(servers.map(checkServer));
        const found = results.find(url => url !== null);
        if (found) {
            console.log(`[ROUTER] 🎯 Active server set to: ${found}`);
            activeServer = found;
        } else {
            console.warn("[ROUTER] ⚠️ No active server responded with 200 OK!");
        }
    } finally {
        isScanning = false;
    }
}

// Start par scan karega
findActiveServer();

// Health check endpoint
app.get('/ping', (req, res) => res.status(200).send("OK"));

// ULTRA-FAST STREAMING PROXY (Direct Socket Pipe)
app.use((req, res) => {
    if (req.path === '/ping') return;

    const targetUrl = new URL(activeServer + req.originalUrl);

    // Headers set karein
    const clientHeaders = { ...req.headers };
    clientHeaders.host = targetUrl.host;
    delete clientHeaders['connection']; // HTTP/1.1 keep-alive control

    const options = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: clientHeaders,
        agent: httpsAgent,
        timeout: 6000 // 6 second timeout
    };

    const proxyReq = https.request(options, (backendRes) => {
        // Agar chal raha server suspend ho gaya (502/503)
        if (backendRes.statusCode === 502 || backendRes.statusCode === 503) {
            findActiveServer(); // Naye active server ki khoj shuru karo
        }

        // Headers pass-through
        res.writeHead(backendRes.statusCode, backendRes.headers);

        // DIRECT PIPING (Zero Buffer, Zero Delay!)
        backendRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        console.error(`[TIMEOUT] ${activeServer} did not respond in 6s. Triggering scan.`);
        findActiveServer();
        if (!res.headersSent) {
            res.status(504).json({ error: "Gateway Timeout: Backend is slow." });
        }
    });

    proxyReq.on('error', (err) => {
        console.error(`[PROXY ERROR] ${err.message}. Finding active server...`);
        findActiveServer();
        if (!res.headersSent) {
            res.status(502).json({ error: "Master Proxy: Backend unreachable." });
        }
    });

    // Client ki request direct backend par stream karein (GET ho ya POST)
    req.pipe(proxyReq);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`High-Speed Native Streaming Router running on port ${PORT}`);
});
