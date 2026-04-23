// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const Order = require('./models/Order');
const User = require('./models/User');
const app = express();
const PORT = process.env.PORT || 3000;

// Konfiguracja sesji
app.use(session({
    secret: process.env.SESSION_SECRET || 'tajny_klucz_sesji',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 godziny
}));

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

// Middleware do sprawdzania czy użytkownik jest zalogowany
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
};

// Middleware do sprawdzania roli admina
const requireAdmin = async (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    try {
        const user = await User.findById(req.session.userId);
        if (user && user.role === 'admin') {
            return next();
        }
        res.status(403).send('Brak uprawnień administratora');
    } catch (err) {
        res.status(500).send('Błąd serwera');
    }
};

// === STRONY PUBLICZNE ===

// Strona główna z wyszukiwarką zamówień
app.get('/', async (req, res) => {
    try {
        const orders = mongoose.connection.readyState === 1
            ? await Order.find().sort({ timestamp: -1 }).limit(50)
            : [];
        res.render('index', { 
            title: 'Mój Sellmo', 
            orders,
            user: req.session.userId ? await User.findById(req.session.userId) : null,
            searchedOrders: [],
            searchedUser: ''
        });
    } catch (err) {
        console.error('Błąd pobierania zamówień:', err);
        res.render('index', { 
            title: 'Mój Sellmo', 
            orders: [],
            user: null,
            searchedOrders: [],
            searchedUser: ''
        });
    }
});

// Wyszukiwarka zamówień po nazwie użytkownika
app.get('/search', async (req, res) => {
    try {
        const searchName = req.query.name || '';
        let searchedOrders = [];
        
        if (searchName.trim()) {
            searchedOrders = await Order.find({ 
                userName: { $regex: searchName, $options: 'i' } 
            }).sort({ timestamp: -1 });
        }
        
        const orders = mongoose.connection.readyState === 1
            ? await Order.find().sort({ timestamp: -1 }).limit(50)
            : [];
            
        res.render('index', { 
            title: 'Mój Sellmo', 
            orders,
            user: req.session.userId ? await User.findById(req.session.userId) : null,
            searchedOrders,
            searchedUser: searchName
        });
    } catch (err) {
        console.error('Błąd wyszukiwania:', err);
        res.redirect('/');
    }
});

// Strona logowania
app.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/admin');
    }
    res.render('login', { title: 'Zaloguj się' });
});

// Strona rejestracji
app.get('/register', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/admin');
    }
    res.render('register', { title: 'Zarejestruj się' });
});

// === AUTORYZACJA ===

// Rejestracja
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Sprawdź czy użytkownik już istnieje
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render('register', { 
                title: 'Zarejestruj się', 
                error: 'Użytkownik już istnieje' 
            });
        }
        
        // Pierwszy zarejestrowany użytkownik zostaje adminem
        const userCount = await User.countDocuments();
        const user = new User({ 
            username, 
            password,
            role: userCount === 0 ? 'admin' : 'user'
        });
        await user.save();
        
        req.session.userId = user._id;
        res.redirect('/admin');
    } catch (err) {
        console.error('Błąd rejestracji:', err);
        res.render('register', { 
            title: 'Zarejestruj się', 
            error: 'Błąd rejestracji' 
        });
    }
});

// Logowanie
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user || !(await user.comparePassword(password))) {
            return res.render('login', { 
                title: 'Zaloguj się', 
                error: 'Nieprawidłowa nazwa użytkownika lub hasło' 
            });
        }
        
        req.session.userId = user._id;
        res.redirect('/admin');
    } catch (err) {
        console.error('Błąd logowania:', err);
        res.render('login', { 
            title: 'Zaloguj się', 
            error: 'Błąd logowania' 
        });
    }
});

// Wylogowanie
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// === PANEL ADMINISTRATORA ===

// Główna strona admina
app.get('/admin', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        // Pobierz wszystkie zamówienia pogrupowane według dni
        const allOrders = await Order.find().sort({ timestamp: -1 });
        
        // Grupowanie po dniu
        const ordersByDay = {};
        allOrders.forEach(order => {
            const day = order.timestamp.toISOString().split('T')[0];
            if (!ordersByDay[day]) {
                ordersByDay[day] = [];
            }
            ordersByDay[day].push(order);
        });
        
        // Grupowanie po użytkowniku
        const ordersByUser = {};
        allOrders.forEach(order => {
            const userName = order.userName || 'Anonimowy';
            if (!ordersByUser[userName]) {
                ordersByUser[userName] = [];
            }
            ordersByUser[userName].push(order);
        });
        
        res.render('admin', { 
            title: 'Panel Administratora', 
            user,
            orders: allOrders,
            ordersByDay,
            ordersByUser
        });
    } catch (err) {
        console.error('Błąd panelu admina:', err);
        res.status(500).send('Błąd serwera');
    }
});

// Zmiana statusu zamówienia
app.post('/admin/order/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await Order.findByIdAndUpdate(req.params.id, { status });
        res.redirect('/admin');
    } catch (err) {
        console.error('Błąd zmiany statusu:', err);
        res.status(500).send('Błąd serwera');
    }
});

// Usuwanie zamówienia
app.post('/admin/order/:id/delete', requireAuth, async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.redirect('/admin');
    } catch (err) {
        console.error('Błąd usuwania:', err);
        res.status(500).send('Błąd serwera');
    }
});

// === WEBHOOK DLA FACEBOOKA ===
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

// Endpoint POST: odbieranie zdarzeń (nowe komentarze)
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

                // Bezpieczne pobieranie nazwy użytkownika
                const userName = (from && from.name) ? from.name : 'Anonimowy Klient';
                console.log(`💬 Nowy komentarz pod live ${liveVideoId}: "${message}" od ${userName}`);

                const keyword = '+1';
                if (message.includes(keyword)) {
                    console.log(`✅ Znaleziono słowo kluczowe "${keyword}"`);

                    try {
                        const existingOrder = await Order.findOne({ commentId });
                        if (!existingOrder) {
                            const newOrder = new Order({
                                commentId,
                                userName: userName,
                                userId: from ? from.id : 'unknown',
                                liveVideoId,
                                productKeyword: keyword,
                                quantity: 1,
                                status: 'nowe'
                            });
                            await newOrder.save();
                            console.log(`📦 Zapisano zamówienie dla ${userName}`);
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