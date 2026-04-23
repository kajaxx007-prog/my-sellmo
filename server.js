// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const Order = require('./models/Order');
const app = express();
const PORT = process.env.PORT || 3000;

// Połączenie z MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch(err => console.error('❌ Błąd połączenia z MongoDB:', err));

// Ustawienia silnika widoków EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json()); // dla danych JSON

// Podstawowa trasa główna
app.get('/', async (req, res) => {
    try {
        const orders = await Order.find().sort({ timestamp: -1 }).limit(50);
        res.render('index', { title: 'Mój Sellmo', orders: orders });
    } catch (err) {
        console.error(err);
        res.render('index', { title: 'Mój Sellmo', orders: [] });
    }
});

// --- WEBHOOK DLA FACEBOOKA ---
// Endpoint GET: weryfikacja webhooka
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === process.env.VERIFY_TOKEN) {
        console.log('✅ Webhook zweryfikowany');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Błąd weryfikacji webhooka');
        res.sendStatus(403);
    }
});

// Endpoint POST: odbieranie zdarzeń (nowe komentarze)
app.post('/webhook', (req, res) => {
    const body = req.body;
    console.log('📩 Otrzymano zdarzenie z Facebooka:', JSON.stringify(body, null, 2));
    
    // Facebook oczekuje szybkiej odpowiedzi 200 OK
    res.status(200).send('EVENT_RECEIVED');

    // Tutaj wkrótce dodamy logikę parsowania komentarzy
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    
    // Facebook wysyła tablicę 'entry'
    if (!body.entry) {
        return res.sendStatus(200);
    }

    for (const entry of body.entry) {
        const changes = entry.changes;
        if (!changes) continue;

        for (const change of changes) {
            // Interesuje nas tylko pole 'feed' (komentarze)
            if (change.field !== 'feed') continue;

            const value = change.value;
            // Sprawdzamy, czy to nowy komentarz i czy dotyczy live_video
            if (value.item === 'comment' && value.verb === 'add') {
                const commentId = value.comment_id;
                const message = value.message || '';
                const from = value.from; // { name, id }
                const postId = value.post_id; // ID posta (dla live to id transmisji)
                const liveVideoId = value.live_video_id; // może być null jeśli nie live

                // Interesują nas tylko komentarze pod transmisją na żywo
                if (!liveVideoId) {
                    console.log(`⚠️ Komentarz nie pod live: ${commentId}`);
                    continue;
                }

                console.log(`💬 Nowy komentarz pod live ${liveVideoId}: "${message}" od ${from.name}`);

                // Sprawdzamy słowo kluczowe (np. "+1")
                const keyword = '+1'; // możesz zmienić na inne
                if (message.includes(keyword)) {
                    console.log(`✅ Znaleziono słowo kluczowe "${keyword}"`);

                    // Sprawdzamy, czy już nie zapisaliśmy tego komentarza (unikalność commentId)
                    const existingOrder = await Order.findOne({ commentId: commentId });
                    if (!existingOrder) {
                        const newOrder = new Order({
                            commentId: commentId,
                            userName: from.name,
                            userId: from.id,
                            liveVideoId: liveVideoId,
                            productKeyword: keyword,
                            quantity: 1,
                            status: 'nowe'
                        });

                        try {
                            await newOrder.save();
                            console.log(`📦 Zapisano zamówienie dla ${from.name}`);
                        } catch (err) {
                            console.error('❌ Błąd zapisu zamówienia:', err);
                        }
                    } else {
                        console.log(`⏩ Komentarz ${commentId} już istnieje w bazie.`);
                    }
                }
            }
        }
    }

    res.sendStatus(200);
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
        dbName: mongoose.connection.name || 'brak'
    });
});


// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`🚀 Serwer działa na http://localhost:${PORT}`);
});