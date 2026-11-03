const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

// Aapke accounts ke servers ki list
const servers = [
    "https://quickprint-dqxs.onrender.com",
    "https://qr-print-vb07.onrender.com"
];

let activeServerIndex = 0;

// Test karne ke liye root route
app.get('/', (req, res) => {
    res.send("Master Router (Reverse Proxy) is active!");
});

// Ping route agar khud ka check karna ho
app.get('/ping', (req, res) => {
    res.status(200).send("OK");
});

// Jab koi QR scan karke aayega: /u/7869834444
app.use('/u/:id', async (req, res, next) => {
    const userId = req.params.id;
    console.log(`\n--- Request for User ID: ${userId} ---`);
    
    let targetServer = servers[activeServerIndex];
    console.log(`Checking preferred server: ${targetServer}`);

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
            console.log(`[SUCCESS] Server is active: ${targetServer}`);
        }
    } catch (error) {
        console.log(`[ERROR] Server down: ${targetServer} -> ${error.message}`);
    }

    // Agar pehla fail hua, toh backup par switch ho jao
    if (!isServerActive) {
        console.log(`Switching to backup server...`);
        activeServerIndex = (activeServerIndex + 1) % servers.length;
        targetServer = servers[activeServerIndex];
        console.log(`[FAILOVER] Using backup server: ${targetServer}`);
    }

    // REVERSE PROXY: URL change nahi hoga, background me data yahin se aayega
    return createProxyMiddleware({
        target: targetServer,
        changeOrigin: true,
        onError: (err, req, res) => {
            res.status(500).send("Proxy Error: Backend server is not responding.");
        }
    })(req, res, next);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Master Reverse Proxy running on port ${PORT}`);
});
