const express = require('express');
const app = express();

// Aapke saare accounts ki list (kisi ko bhi pehle rakh sakte hain)
const servers = [
    "https://quickprint-dqxs.onrender.com",
    "https://qr-print-vb07.onrender.com"
];

// Helper function jo sare servers ko check karke pehla active server dhoondhega
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
                // Yeh server active aur working hai!
                return server;
            }
        } catch (error) {
            // Yeh server band hai ya bandwidth khatam hai, agle ko check karo
        }
    }
    // Agar koi active na mile, toh default me pehla wala return kar do
    return servers[0];
}

app.get('/', (req, res) => {
    res.send("Master Router (Smart Auto-Select) is active!");
});

app.get('/ping', (req, res) => {
    res.status(200).send("OK");
});

app.use('/', async (req, res) => {
    if (req.path === '/' || req.path === '/ping') return;

    const originalPath = req.originalUrl;
    
    // 🎯 AUTOMATICALLY BEST WORKING SERVER SELECT KAREGA
    let targetServer = await getBestActiveServer();
    console.log(`[SMART ROUTER] Selected active server: ${targetServer}`);

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
    console.log(`Smart Auto-Select Master Proxy running on port ${PORT}`);
});
