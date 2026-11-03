const express = require('express');
const app = express();

// Aapke accounts ke servers ki list
const servers = [
    "https://quickprint-dqxs.onrender.com",
    "https://qr-print-vb07.onrender.com"
];

let activeServerIndex = 0;

// Test karne ke liye root route
app.get('/', (req, res) => {
    res.send("Master Router (Full Proxy) is active!");
});

app.get('/ping', (req, res) => {
    res.status(200).send("OK");
});

// HAR TARIKH KI REQUEST (/u/... aur /api/...) KO BACKEND PAR PROXY KAREGA
app.use('/', async (req, res) => {
    // Agar master router ka khud ka root ya ping hai toh use yahin handle karo
    if (req.path === '/' || req.path === '/ping') {
        return;
    }

    const originalPath = req.originalUrl; // e.g. /u/7869834444 ya /api/jobs/xyz
    let targetServer = servers[activeServerIndex];

    let isServerActive = false;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const check = await fetch(`${targetServer}/ping`, { 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);

        if (check.ok) {
            isServerActive = true;
        }
    } catch (error) {
        // Server down
    }

    // Agar pehla server fail ho gaya, toh backup par switch ho jao
    if (!isServerActive) {
        activeServerIndex = (activeServerIndex + 1) % servers.length;
        targetServer = servers[activeServerIndex];
        console.log(`[FAILOVER] Switched to backup server: ${targetServer}`);
    }

    const targetUrl = `${targetServer}${originalPath}`;

    try {
        // Request ke liye headers aur body prepare karo (POST aur file uploads ke liye zaroori hai)
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (key !== 'host') headers.set(key, value);
        }
        headers.set('host', new URL(targetServer).host);

        let body = undefined;
        if (!['GET', 'HEAD'].includes(req.method)) {
            // Agar POST request hai (jaise file upload ya status update), toh body stream pass karo
            body = req; 
        }

        const backendResponse = await fetch(targetUrl, {
            method: req.method,
            headers: headers,
            body: body,
            duplex: 'half' // Node.js me streaming body ke liye zaroori hai
        });

        // Backend ke headers user ko bhejo
        backendResponse.headers.forEach((val, key) => {
            res.setHeader(key, val);
        });

        res.status(backendResponse.status);

        // Response ko stream karo (Polling JSON responses aur file downloads ke liye)
        const reader = backendResponse.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();

    } catch (err) {
        console.error(`Proxy Error for ${originalPath}: ${err.message}`);
        if (!res.headersSent) {
            res.status(500).send("Proxy Error: Unable to reach backend print server.");
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Master Full Proxy running on port ${PORT}`);
});
