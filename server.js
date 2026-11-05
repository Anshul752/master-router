const express = require('express');
const app = express();

// Login / Forms ke data ko theek se bhejne ke liye
app.use(express.raw({ type: '*/*', limit: '10mb' }));

const servers = [
    "https://qr-print-1.onrender.com",
    "https://qr-print-2.onrender.com",
    "https://qr-print-3.onrender.com",
    "https://qr-print-4.onrender.com"
];

// Memory me sirf wahi 1 active server rahega
let activeServer = servers[0];

// Single server checker (Fast Timeout: 2.5s)
async function checkServer(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const res = await fetch(`${url}/ping`, { signal: controller.signal });
        clearTimeout(timeoutId);

        // Render suspend hone par 200 OK nahi deta
        if (res.ok && res.status === 200) {
            return url;
        }
    } catch (e) {
        // Suspend ya dead server
    }
    return null;
}

// CHARON SERVERS KO EK SAATH (PARALLEL) SCAN KARNE WALA FUNCTION
async function findAndLockActiveServer() {
    try {
        // Ek saath sabhi servers ko ping karo (Promise.all)
        const results = await Promise.all(servers.map(checkServer));
        const found = results.find(url => url !== null);

        if (found) {
            if (activeServer !== found) {
                console.log(`[SMART ROUTER] 🎯 Found Active Server: ${found}`);
                activeServer = found;
            }
        } else {
            console.warn("[WARNING] Koi bhi server 200 OK nahi de raha (All sleeping/suspended).");
        }
    } catch (err) {
        console.error("Scanner Error:", err.message);
    }
}

// Start hote hi scanner chalao aur har 25 second me background me check karo
findAndLockActiveServer();
setInterval(findAndLockActiveServer, 25000);

// Router ka apna Ping (Render health check)
app.get('/ping', (req, res) => res.status(200).send("OK"));

// DIRECT FAST PROXY (Bina kisi delay ke)
app.use(async (req, res) => {
    if (req.path === '/ping') return;

    const originalPath = req.originalUrl;
    const targetUrl = `${activeServer}${originalPath}`;

    try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (key.toLowerCase() !== 'host') {
                headers.set(key, value);
            }
        }
        headers.set('host', new URL(activeServer).host);

        let options = {
            method: req.method,
            headers: headers
        };

        if (!['GET', 'HEAD'].includes(req.method) && req.body && req.body.length > 0) {
            options.body = req.body;
        }

        const backendResponse = await fetch(targetUrl, options);

        // Agar chal raha server abhi-abhi suspend ho gaya ho
        if (backendResponse.status === 502 || backendResponse.status === 503) {
            const testText = await backendResponse.clone().text();
            if (testText.includes("Render") || testText.includes("spinning up") || testText.includes("suspended")) {
                findAndLockActiveServer(); // Turant naya active server dhoondho
                return res.status(502).json({ 
                    error: "Server switch ho raha hai ya wake up ho raha hai. Please 5 second baad refresh karein." 
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

        // Login Cookies ko set karein
        const setCookie = backendResponse.headers.getSetCookie ? backendResponse.headers.getSetCookie() : null;
        if (setCookie && setCookie.length > 0) {
            res.setHeader('set-cookie', setCookie);
        }

        res.status(backendResponse.status);
        const buffer = await backendResponse.arrayBuffer();
        return res.send(Buffer.from(buffer));

    } catch (err) {
        console.error(`Error reaching ${activeServer}: ${err.message}`);
        findAndLockActiveServer(); // Error aate hi scanner chalao
        if (!res.headersSent) {
            return res.status(502).json({ error: "Master Proxy: Unable to reach backend server." });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Parallel Smart Router running on port ${PORT}`);
});
