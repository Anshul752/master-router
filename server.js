const express = require('express');
const https = require('https');
const { URL } = require('url');

const app = express();

// =====================================================================
// 👉 Render Dashboard ke Environment se URL lega (Nahi milega toh default 1st server)
const BACKEND_URL = process.env.BACKEND_URL;
// =====================================================================

// High-Speed Keep-Alive Agent (Python socket reset 10054 ko rokne ke liye)
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 100
});

// Render Health Check
app.get('/ping', (req, res) => res.status(200).send("OK"));

// DIRECT 1-TO-1 STREAM PROXY (0ms Delay)
app.use((req, res) => {
    if (req.path === '/ping') return;

    const targetUrl = new URL(BACKEND_URL + req.originalUrl);

    // Host header replace karein
    const clientHeaders = { ...req.headers };
    clientHeaders.host = targetUrl.host;
    delete clientHeaders['connection'];

    const options = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: clientHeaders,
        agent: httpsAgent
    };

    const proxyReq = https.request(options, (backendRes) => {
        // Direct response pass karein
        res.writeHead(backendRes.statusCode, backendRes.headers);
        backendRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error(`Proxy Error: ${err.message}`);
        if (!res.headersSent) {
            res.status(502).json({ error: "Master Proxy: Unable to reach backend server." });
        }
    });

    // Direct request pass karein
    req.pipe(proxyReq);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Single Direct Proxy active pointing to: ${BACKEND_URL}`);
});
