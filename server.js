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
    res.send("Master Router (Proxy) is active!");
});

app.get('/ping', (req, res) => {
    res.status(200).send("OK");
});

// PROXY ROUTE: URL change nahi hoga, data background se aayega
app.use('/u/:id', async (req, res) => {
    const originalPath = req.originalUrl; // e.g. /u/7869834444
    let targetServer = servers[activeServerIndex];

    console.log(`\n--- Request: ${originalPath} ---`);
    console.log(`Preferred server: ${targetServer}`);

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
        console.log(`Server down: ${targetServer}`);
    }

    // Agar pehla server fail ho gaya, toh backup par switch ho jao
    if (!isServerActive) {
        activeServerIndex = (activeServerIndex + 1) % servers.length;
        targetServer = servers[activeServerIndex];
        console.log(`[FAILOVER] Switched to backup server: ${targetServer}`);
    }

    const targetUrl = `${targetServer}${originalPath}`;
    console.log(`Proxying request to: ${targetUrl}`);

    try {
        // Backend Render server se data fetch karo
        const backendResponse = await fetch(targetUrl, {
            method: req.method,
            headers: {
                ...req.headers,
                host: new URL(targetServer).host // Host header fix karne ke liye
            },
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body
        });

        // Headers copy karo
        backendResponse.headers.forEach((val, key) => {
            res.setHeader(key, val);
        });

        res.status(backendResponse.status);

        // Data ko user ke browser par stream kar do
        const buffer = await backendResponse.arrayBuffer();
        res.send(Buffer.from(buffer));

    } catch (err) {
        console.error(`Proxy Fetch Error: ${err.message}`);
        res.status(500).send("Proxy Error: Unable to reach backend print server.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Master Native Proxy running on port ${PORT}`);
});
