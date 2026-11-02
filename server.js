const express = require('express');
const app = express();

// Aapke accounts ke servers ki list
const servers = [
    "https://quickprint-dqxs.onrender.com",
    "https://qr-print-vb07.onrender.com"
];

let activeServerIndex = 0;

// Test karne ke liye ki router chal raha hai ya nahi
app.get('/', (req, res) => {
    res.send("Master Router is active and running!");
});

// Jab koi QR code scan karke aayega: /u/7869834444
app.get('/u/:id', async (req, res) => {
    const userId = req.params.id;
    console.log(`\n--- New Request Received for User ID: ${userId} ---`);
    
    let targetServer = servers[activeServerIndex];
    console.log(`Checking current preferred server: ${targetServer}`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        // Check karenge ki server zinda hai ya nahi (/ping route se)
        const check = await fetch(`${targetServer}/ping`, { 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);

        if (check.ok) {
            console.log(`[SUCCESS] Server is active. Redirecting to: ${targetServer}/u/${userId}`);
            return res.redirect(302, `${targetServer}/u/${userId}`);
        } else {
            console.log(`[WARNING] Server responded with status: ${check.status}`);
        }
    } catch (error) {
        console.log(`[ERROR] Server down ya unreachable hai: ${targetServer} -> Error: ${error.message}`);
    }

    // Agar pehla server fail ho gaya, toh agle server par switch ho jao
    console.log(`Switching to backup server...`);
    activeServerIndex = (activeServerIndex + 1) % servers.length;
    targetServer = servers[activeServerIndex];
    
    console.log(`[FAILOVER] Redirecting to backup server: ${targetServer}/u/${userId}`);
    // Naye active server par redirect kar do
    return res.redirect(302, `${targetServer}/u/${userId}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Master Router running and listening on port ${PORT}`);
});
