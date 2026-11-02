const express = require('express');
const app = express();

// Aapke accounts ke servers ki list (Aap yahan aur bhi add kar sakte hain)
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
    let targetServer = servers[activeServerIndex];

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        // Check karenge ki server zinda hai ya nahi (/ping route se)
        const check = await fetch(`${targetServer}/ping`, { 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);

        if (check.ok) {
            return res.redirect(302, `${targetServer}/u/${userId}`);
        }
    } catch (error) {
        console.log(`Server down hai: ${targetServer}`);
    }

    // Agar pehla server fail ho gaya, toh agle server par switch ho jao
    activeServerIndex = (activeServerIndex + 1) % servers.length;
    targetServer = servers[activeServerIndex];

    // Naye active server par redirect kar do
    return res.redirect(302, `${targetServer}/u/${userId}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Master Router running on port ${PORT}`);
});
