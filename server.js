const express = require('express');
const app = express();

// Aapke saare backend accounts ki list
const servers = [
    "https://qr-print-1.onrender.com",
    "https://qr-print-2.onrender.com",
    "https://qr-print-3.onrender.com",
    "https://qr-print-4.onrender.com"
];

// Helper function jo sabhi servers ko check karega
async function getBestActiveServer() {
    for (let server of servers) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5 sec timeout

            const check = await fetch(`${server}/ping`, { 
                signal: controller.signal 
            });
            clearTimeout(timeoutId);

            if (check.ok) {
                return server; // Working server mil gaya
            }
        } catch (error) {
            // Server down/sleep hai, agle ko check karo
        }
    }
    // Agar koi active na mile to pehle wale par default bhej do
    return servers[0];
}

// Render Health Check ke liye sirf /ping rakhein
app.get('/ping', (req, res) => {
    res.status(200).send("OK");
});

// BAAKI SAARI REQUESTS (including Homepage '/') BACKEND PAR FORWARD HONGI
app.use(async (req, res) => {
    // Agar /ping request hai toh skip karo
    if (req.path === '/ping') return;

    const originalPath = req.originalUrl;
    
    // 🎯 BEST WORKING SERVER SELECT KAREGA
    let targetServer = await getBestActiveServer();
    console.log(`[SMART ROUTER] Forwarding to active server: ${targetServer}${originalPath}`);

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

        const contentType = backendResponse.headers.get('content-type') || '';
        if (!backendResponse.ok && contentType.includes('text/html')) {
            return res.status(502).json({ 
                error: "Backend server is waking up from sleep. Please retry in 10-15 seconds." 
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
    console.log(`Smart Auto-Select Master Proxy running on port ${PORT}`);
});
