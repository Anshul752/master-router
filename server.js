const express = require('express');
const app = express();

// Aapke saare backend accounts ki list
const servers = [
    "https://qr-print-1.onrender.com",
    "https://qr-print-2.onrender.com",
    "https://qr-print-3.onrender.com",
    "https://qr-print-4.onrender.com"
];

// Helper function jo sabhi servers ko check karke active server dhoondhega
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
                return server; // Active server mil gaya
            }
        } catch (error) {
            // Server down/sleep hai, agle ko check karo
        }
    }
    // Agar koi active na mile to default me pehla server return karo
    return servers[0];
}

// Render Health Check ke liye sirf /ping alag se handle hoga
app.get('/ping', (req, res) => {
    res.status(200).send("OK");
});

// BAAKI SAARI REQUESTS (Homepage, Login, APIs) YAHAN SE FORWARD HONGI
app.use(async (req, res) => {
    if (req.path === '/ping') return;

    const originalPath = req.originalUrl;
    
    // 🎯 Active server select karega
    let targetServer = await getBestActiveServer();
    console.log(`[SMART ROUTER] Forwarding to: ${targetServer}${originalPath}`);

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

        // Sirf tabhi sleep error dikhana hai jab sach me Render ka 502/503 sleeping page ho
        if (backendResponse.status === 502 || backendResponse.status === 503) {
            const testText = await backendResponse.clone().text();
            if (testText.includes("Render") || testText.includes("spinning up")) {
                return res.status(502).json({ 
                    error: "Backend server is waking up from sleep. Please retry in 10-15 seconds." 
                });
            }
        }

        // Response headers copy karna (encoding/length ko chhod kar taaki page corrupt na ho)
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
