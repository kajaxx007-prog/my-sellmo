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
const BotTemplate = require('./models/BotTemplate');
const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bot');
const {
    startScheduler,
    stopAllScheduledTasks,
    rescheduleTemplate
} = require('./services/chatScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// WYSYŁANIE WIADOMOŚCI NA LIVE
// --------------------------------------------------
async function sendMessageToLive(message) {
    const liveVideoId = global.currentLiveVideoId;
    const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!liveVideoId || !pageAccessToken) {
        console.log('Brak aktywnego live lub tokena – nie wysyłam wiadomości');
        return;
    }

    try {
        await axios.post(
            `https://graph.facebook.com/v25.0/${liveVideoId}/comments`,
            { message },
            {
                params: {
                    access_token: pageAccessToken
                }
            }
        );

        console.log(`📤 Wysłano wiadomość do live: "${message}"`);
    } catch (err) {
        console.error(
            '❌ Błąd wysyłania wiadomości:',
            err.response?.data || err.message
        );
    }
}

botRoutes.setSendMessageCallback(sendMessageToLive);

// --------------------------------------------------
// MONGODB
// --------------------------------------------------
const dbUri = process.env.MONGODB_URI;

if (dbUri) {
    const maskedUri = dbUri.replace(/:([^@]+)@/, ':*****@');
    console.log('Łączę z MongoDB:', maskedUri);
} else {
    console.error('❌ MONGODB_URI nie jest ustawione!');
}

mongoose.connect(dbUri)
    .then(async () => {
        console.log('✅ Połączono z MongoDB');

        if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
            try {
                if (!global.schedulerStarted) {
                    global.schedulerStarted = true;

                    await startScheduler(sendMessageToLive);
                    console.log('⏰ Scheduler chatbota uruchomiony');
                } else {
                    console.log('⚠️ Scheduler już działa — pomijam ponowne uruchomienie');
                }
            } catch (schedulerError) {
                console.error(
                    '❌ Błąd uruchamiania schedulera:',
                    schedulerError.message
                );
            }
        }
    })
    .catch(err => {
        console.error('❌ Błąd połączenia z MongoDB:', err.message);

        if (err.code === 'ENOTFOUND') {
            console.error('Nie można odnaleźć hosta – sprawdź nazwę klastra.');
        }

        if (err.code === 'AUTHENTICATION_FAILED') {
            console.error('Błędne dane logowania – sprawdź hasło.');
        }
    });

// --------------------------------------------------
// SESSION STORE
// --------------------------------------------------
const store = new MongoDBStore({
    uri: process.env.MONGODB_URI,
    collection: 'sessions'
});

store.on('error', (err) => {
    console.error('❌ Błąd magazynu sesji:', err);
});

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'bardzo-tajny-klucz',
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// --------------------------------------------------
// HEALTHCHECK
// Railway -> Healthcheck Path: /ping
// --------------------------------------------------
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// --------------------------------------------------
// AUTH
// --------------------------------------------------
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
}

// --------------------------------------------------
// HOME
// --------------------------------------------------
app.get('/', async (req, res) => {
    try {
        const orders = mongoose.connection.readyState === 1
            ? await Order.find().sort({ timestamp: -1 }).limit(20)
            : [];

        res.render('index', {
            title: 'Mój Sellmo',
            orders
        });
    } catch (err) {
        console.error('Błąd pobierania zamówień:', err);

        res.render('index', {
            title: 'Mój Sellmo',
            orders: []
        });
    }
});

// --------------------------------------------------
// SEARCH
// --------------------------------------------------
app.get('/search', async (req, res) => {
    const nameQuery = req.query.name;

    if (!nameQuery) {
        return res.redirect('/');
    }

    try {
        const orders = await Order.find({
            userName: new RegExp(nameQuery, 'i')
        }).sort({ timestamp: -1 });

        res.render('search', {
            orders,
            query: nameQuery
        });
    } catch (err) {
        console.error(err);
        res.render('search', {
            orders: [],
            query: nameQuery
        });
    }
});

// --------------------------------------------------
// ROUTES
// --------------------------------------------------
app.use(authRoutes);
app.use(botRoutes);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
app.listen(PORT, () => {
    console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
