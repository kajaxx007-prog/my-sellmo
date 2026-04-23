// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const Order = require('./models/Order');
const app = express();
const PORT = process.env.PORT || 3000;

// Logowanie URI (z ukrytym hasłem) dla diagnostyki
const dbUri = process.env.MONGODB_URI;
if (dbUri) {
    const maskedUri = dbUri.replace(/:([^@]+)@/, ':*****@');
    console.log('Łączę z MongoDB:', maskedUri);
} else {
    console.error('❌ MONGODB_URI nie jest ustawione!');
}

mongoose.connect(dbUri)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch(err => {
        console.error('❌ Błąd połączenia z MongoDB:', err.message);
        if (err.code === 'ENOTFOUND') console.error('   Nie można odnaleźć hosta – sprawdź nazwę klastra.');
        if (err.code === 'AUTHENTICATION_FAILED') console.error('   Błędne dane logowania – sprawdź hasło.');
    });

// Ustawienia silnika widoków EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Podstawowa trasa główna (tylko gdy baza jest połączona)
app.get('/', async (req, res) => {
    try {
        const orders = mongoose.connection.readyState === 1
            ? await Order.find().sort({ timestamp: -1 }).limit(50)
            : [];
        res.render('index', { title: 'Mój Sellmo', orders });
    } catch (err) {
        console.error('Błąd pobierania zamówień:', err);
        res.render('index', { title: 'Mój Sellmo', orders: [] });
    }
});

// --- WEBHOOK DLA FACEBOOKA ---
// Endpoint GET: weryfikacja webhooka
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('GET /webhook query:', req.query);
    if (mode && token === process.env.VERIFY_TOKEN) {
        console.log('✅ Webhook zweryfikowany');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Błąd weryfikacji webhooka');
        res.sendStatus(403);
    }
});

// Endpoint POST: odbieranie zdarzeń (nowe komentarze) – wersja scalona
app.post('/webhook', async (req, res) => {
    const body = req.body;
    console.log('📩 Otrzymano zdarzenie z Facebooka:', JSON.stringify(body, null, 2));

    // Zawsze odpowiadamy 200 OK natychmiast
    res.status(200).send('EVENT_RECEIVED');

    if (!body.entry) return;

    for (const entry of body.entry) {
        const changes = entry.changes;
        if (!changes) continue;

        for (const change of changes) {
            if (change.field !== 'feed') continue;

            const value = change.value;
            if (value.item === 'comment' && value.verb === 'add') {
                const commentId = value.comment_id;
                const message = value.message || '';
                const from = value.from;
                const liveVideoId = value.live_video_id;

                if (!liveVideoId) {
                    console.log(`⚠️ Komentarz nie pod live: ${commentId}`);
                    continue;
                }

                console.log(`💬 Nowy komentarz pod live ${liveVideoId}: "${message}" od ${from.name}`);

                const keyword = '+1';
                if (message.includes(keyword)) {
                    console.log(`✅ Znaleziono słowo kluczowe "${keyword}"`);

                    try {
                        const existingOrder = await Order.findOne({ commentId });
                        if (!existingOrder) {
                            const newOrder = new Order({
                                commentId,
                                userName: from.name,
                                userId: from.id,
                                liveVideoId,
                                productKeyword: keyword,
                                quantity: 1,
                                status: 'nowe'
                            });
                            await newOrder.save();
                            console.log(`📦 Zapisano zamówienie dla ${from.name}`);
                        } else {
                            console.log(`⏩ Komentarz ${commentId} już istnieje w bazie.`);
                        }
                    } catch (err) {
                        console.error('❌ Błąd zapisu zamówienia:', err);
                    }
                }
            }
        }
    }
});

// Testowy endpoint do sprawdzenia statusu MongoDB
app.get('/db-status', (req, res) => {
    const state = mongoose.connection.readyState;
    const states = {
        0: 'Rozłączona',
        1: 'Połączona',
        2: 'Łączenie...',
        3: 'Rozłączanie...',
    };
    res.json({
        status: states[state] || 'Nieznany',
        dbName: mongoose.connection.name || 'brak',
        error: mongoose.connection._connectionError?.message || null
    });
});

// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`🚀 Serwer działa na porcie ${PORT}`);
});