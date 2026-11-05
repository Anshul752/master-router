const express = require('express');
const app = express();

const servers = [
    "https://qr-print-1.onrender.com",
    "https://qr-print-2.onrender.com",
    "https://qr-print-3.onrender.com",
    "https://qr-print-4.onrender.com"
];

// Memory me active server save rahega (0ms Delay ke liye)
let currentActiveServer = servers[0];

// Background health check function
async function checkAndUpdateBestServer() {
    for (let server of servers) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 sec fast timeout

            const check = await fetch(`${server}/ping`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (check.ok) {
                if (currentActiveServer !== server) {
                    console.log(`[HEALTH CHECK] Switched active server to: ${server}`);
                    currentActiveServer = server;
                }
                return;
            }
        } catch (error) {
            // Yeh server sleep/down hai, agle ko check karo
        }
    }
}

// Har 10 second me background me check karega (User ko wait nahi karna padega)
setInterval(checkAndUpdateBestServer, 10000);
checkAndUpdateBestServer(); // Start hote hi ek baar run karega

// Render Health Check
app.get('/ping', (req, res) => {
    res.status(200).send("OK");
});

// INSTANT PROXY (ZERO DELAY)
app.use(async (req, res) => {
    if (req.path === '/ping') return;

    const originalPath = req.originalUrl;
    const targetServer = currentActiveServer; // Turant cached active server use hoga
    const targetUrl = `${targetServer}${originalPath}`;

    try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (key.toLowerCase() !== 'host') {
                headers.set(key, value);
            }
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

        // Agar Render ka sleeping error ho to turant agla check trigger karo
        if (backendResponse.status === 502 || backendResponse.status === 503) {
            const testText = await backendResponse.clone().text();
            if (testText.includes("Render") || testText.includes("spinning up")) {
                checkAndUpdateBestServer(); // Background me naya server dhoondo
                return res.status(502).json({ 
                    error: "Backend server is waking up. Please refresh in 5 seconds." 
                });
            }
        }

        // Headers pass karein
        backendResponse.headers.forEach((val, key) => {
            const lowerKey = key.toLowerCase();
            if (lowerKey !== 'content-encoding' && lowerKey !== 'content-length' && lowerKey !== 'transfer-encoding') {
                res.setHeader(key, val);
            }
        });

        res.status(backendResponse.status);

        const buffer = await backendResponse.arrayBuffer();
        return res.send(Buffer.from(buffer));

    } catch (err) {
        console.error(`Proxy Error on ${targetServer}: ${err.message}`);
        checkAndUpdateBestServer(); // Error aate hi naya server dhundo
        if (!res.headersSent) {
            return res.status(502).json({ error: "Master Proxy: Backend unreachable, retrying..." });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ultra-Fast Master Proxy running on port ${PORT}`);
});
