// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const axios = require('axios');

const Order = require('./models/Order');
const User = require('./models/User');
const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bot');
// TYMCZASOWO WYŁĄCZAMY SCHEDULER
// const BotTemplate = require('./models/BotTemplate');
// const { startScheduler, ... } = require('./services/chatScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// 1. REJESTRUJEMY KAŻDE ŻĄDANIE (aby zobaczyć health check)
// --------------------------------------------------
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --------------------------------------------------
// 2. NATYCHMIASTOWY HEALTH CHECK (jeszcze przed resztą)
// --------------------------------------------------
app.get('/ping', (req, res) => {
    console.log('💚 Health check OK');
    res.send('pong');
});

// --------------------------------------------------
// 3. START SERWERA – NASŁUCHIWANIE PORTU (zanim cokolwiek innego)
// --------------------------------------------------
app.listen(PORT, () => {
    console.log(`🚀 Serwer nasłuchuje na porcie ${PORT}`);
    // Połączenie i reszta dopiero po uruchomieniu nasłuchu
    initializeApp();
});

// --------------------------------------------------
// 4. FUNKCJA INICJALIZACYJNA (MongoDB + trasy)
// --------------------------------------------------
async function initializeApp() {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
        console.error('❌ MONGODB_URI nie jest ustawione!');
        return;
    }

    try {
        await mongoose.connect(dbUri);
        console.log('✅ Połączono z MongoDB');

        // TYMCZASOWO BEZ SCHEDULERA
        // if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN) { ... }

        setupRoutes();
    } catch (err) {
        console.error('❌ Błąd połączenia z MongoDB:', err.message);
    }
}

// --------------------------------------------------
// 5. KONFIGURACJA TRAS I MIDDLEWARE
// --------------------------------------------------
function setupRoutes() {
    // Session store
    const store = new MongoDBStore({
        uri: process.env.MONGODB_URI,
        collection: 'sessions'
    });
    store.on('error', (err) => console.error('❌ Błąd magazynu sesji:', err));

    // Widoki
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // Parsery
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    // Sesja
    app.use(session({
        secret: process.env.SESSION_SECRET || 'tajny-klucz',
        resave: false,
        saveUninitialized: false,
        store,
        cookie: { maxAge: 1000 * 60 * 60 * 24 }
    }));

    // Auth middleware
    function requireAuth(req, res, next) {
        if (!req.session.userId) return res.redirect('/login');
        next();
    }

    // Trasy publiczne
    app.get('/privacy-policy', (req, res) => {
        res.send(`<h1>Polityka prywatności – Sellmo</h1><p><a href="/">Powrót</a></p>`);
    });

    app.get('/', async (req, res) => {
        try {
            const orders = mongoose.connection.readyState === 1
                ? await Order.find().sort({ timestamp: -1 }).limit(20)
                : [];
            res.render('index', { title: 'Mój Sellmo', orders });
        } catch (err) {
            res.render('index', { title: 'Mój Sellmo', orders: [] });
        }
    });

    app.get('/search', async (req, res) => {
        const nameQuery = req.query.name;
        if (!nameQuery) return res.redirect('/');
        try {
            const orders = await Order.find({ userName: new RegExp(nameQuery, 'i') }).sort({ timestamp: -1 });
            res.render('search', { orders, query: nameQuery });
        } catch (err) {
            res.render('search', { orders: [], query: nameQuery });
        }
    });

    // Trasy autoryzacji i bota
    app.use(authRoutes);
    app.use(botRoutes);

    // Panel admina
    app.get('/admin', requireAuth, async (req, res) => {
        try {
            const orders = await Order.find().sort({ timestamp: 1 });
            const daysMap = {};
            orders.forEach(order => {
                const day = order.timestamp.toISOString().split('T')[0];
                if (!daysMap[day]) daysMap[day] = [];
                daysMap[day].push(order);
            });
            const days = Object.keys(daysMap)
                .map(date => ({ date, orders: daysMap[date] }))
                .sort((a, b) => b.date.localeCompare(a.date));
            res.render('admin', { days });
        } catch (err) {
            res.send('Błąd serwera');
        }
    });

    // Webhook Facebooka
    app.get('/webhook', (req, res) => {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (mode && token === process.env.VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        }
        res.sendStatus(403);
    });

    app.post('/webhook', async (req, res) => {
        const body = req.body;
        console.log('📩 Webhook:', JSON.stringify(body));
        res.status(200).send('EVENT_RECEIVED');
        // ... logika zapisu zamówienia (możesz wkleić poprzednią)
    });

    // Endpoint testowy
    app.get('/db-status', (req, res) => {
        const state = mongoose.connection.readyState;
        const states = { 0: 'Rozłączona', 1: 'Połączona', 2: 'Łączenie...', 3: 'Rozłączanie...' };
        res.json({ status: states[state] || 'Nieznany', dbName: mongoose.connection.name || 'brak' });
    });
}
