// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Health check – musi być natychmiast dostępny
app.get('/ping', (req, res) => res.send('pong'));

// 2. Start serwera od razu
app.listen(PORT, () => {
    console.log(`🚀 Serwer działa na porcie ${PORT}`);

    // 3. Połączenie z MongoDB (asynchronicznie, nie blokuje startu)
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
        console.error('❌ MONGODB_URI brak!');
        return;
    }
    mongoose.connect(dbUri)
        .then(() => console.log('✅ MongoDB połączona'))
        .catch(err => console.error('❌ MongoDB:', err.message));
});

// 4. Prosty endpoint diagnostyczny
app.get('/db-status', (req, res) => {
    const state = mongoose.connection.readyState;
    const states = { 0: 'Rozłączona', 1: 'Połączona', 2: 'Łączenie...', 3: 'Rozłączanie...' };
    res.json({ status: states[state] || 'Nieznany' });
});
