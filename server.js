const express = require('express');
const app = express();

// Aapke accounts ke servers ki list
const servers = [
    "https://quickprint-dqxs.onrender.com",
    "https://qr-print-vb07.onrender.com"
];

let activeServerIndex = 0;

app.get('/', (req, res) => {
    res.send("Master Router (Stable Proxy) is active!");
});

app.get('/ping', (req, res) => {
    res.status(200).send("OK");
});

app.use('/', async (req, res) => {
    if (req.path === '/' || req.path === '/ping') return;

    const originalPath = req.originalUrl;
    let targetServer = servers[activeServerIndex];

    let isServerActive = false;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const check = await fetch(`${targetServer}/ping`, { 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);

        if (check.ok) isServerActive = true;
    } catch (error) {
        // Server down
    }

    if (!isServerActive) {
        activeServerIndex = (activeServerIndex + 1) % servers.length;
        targetServer = servers[activeServerIndex];
        console.log(`[FAILOVER] Switched to: ${targetServer}`);
    }

    const targetUrl = `${targetServer}${originalPath}`;

    try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (key !== 'host') headers.set(key, value);
        }
        headers.set('host', new URL(targetServer).host);

        let options = {
            method: req.method,
            headers: headers
        };

        if (!['GET', 'HEAD'].includes(req.method)) {
            options.body = req;
            options.duplex = 'half';
        }

        const backendResponse = await fetch(targetUrl, options);

        // Agar Render ka sleep page ya HTML error aa raha hai toh JSON format me do
        const contentType = backendResponse.headers.get('content-type') || '';
        if (!backendResponse.ok && contentType.includes('text/html')) {
            return res.status(502).json({ 
                error: "Backend server is waking up from sleep. Please retry in 10 seconds." 
            });
        }

        backendResponse.headers.forEach((val, key) => {
            res.setHeader(key, val);
        });

        res.status(backendResponse.status);

        const buffer = await backendResponse.arrayBuffer();
        return res.send(Buffer.from(buffer));

    } catch (err) {
        console.error(`Proxy Error: ${err.message}`);
        if (!res.headersSent) {
            return res.status(502).json({ error: "Master Proxy: Unable to reach backend server." });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Stable Master Proxy running on port ${PORT}`);
});
