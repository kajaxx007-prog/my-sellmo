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
// NATYCHMIASTOWY HEALTHCHECK DLA RAILWAY
// --------------------------------------------------
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// --------------------------------------------------
// FUNKCJA WYSYŁANIA WIADOMOŚCI NA LIVE
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
      { params: { access_token: pageAccessToken } }
    );
    console.log(`📤 Wysłano wiadomość do live: "${message}"`);
  } catch (err) {
    console.error('❌ Błąd wysyłania wiadomości:', err.response?.data || err.message);
  }
}

// Przekazanie callbacka do tras bota
botRoutes.setSendMessageCallback(sendMessageToLive);

// --------------------------------------------------
// POŁĄCZENIE Z MONGODB
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
        await startScheduler(sendMessageToLive);
        console.log('⏰ Scheduler chatbota uruchomiony');
      } catch (schedulerError) {
        console.error('❌ Błąd uruchamiania schedulera:', schedulerError.message);
      }
    }
  })
  .catch(err => {
    console.error('❌ Błąd połączenia z MongoDB:', err.message);
    if (err.code === 'ENOTFOUND') console.error('Nie można odnaleźć hosta – sprawdź nazwę klastra.');
    if (err.code === 'AUTHENTICATION_FAILED') console.error('Błędne dane logowania – sprawdź hasło.');
  });

// --------------------------------------------------
// SESSION STORE W MONGODB
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
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// --------------------------------------------------
// AUTH MIDDLEWARE
// --------------------------------------------------
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

// --------------------------------------------------
// POLITYKA PRYWATNOŚCI
// --------------------------------------------------
app.get('/privacy-policy', (req, res) => {
  res.send(`
    <h1>Polityka prywatności – Sellmo</h1>
    <p>Data ostatniej aktualizacji: ${new Date().toISOString().split('T')[0]}</p>
    <h2>Jakie dane zbieramy?</h2>
    <p>Aplikacja Sellmo zbiera wyłącznie publicznie dostępne dane z komentarzy pod transmisjami na żywo na stronie Facebook, w tym imię i nazwisko użytkownika oraz treść komentarza.</p>
    <h2>Jak wykorzystujemy dane?</h2>
    <p>Dane są przechowywane w MongoDB Atlas i używane wyłącznie do obsługi zamówień oraz wyświetlania ich w panelu administratora.</p>
    <p><a href="/">Powrót</a></p>
  `);
});

// --------------------------------------------------
// HOME
// --------------------------------------------------
app.get('/', async (req, res) => {
  try {
    const orders = mongoose.connection.readyState === 1
      ? await Order.find().sort({ timestamp: -1 }).limit(20)
      : [];
    res.render('index', { title: 'Mój Sellmo', orders });
  } catch (err) {
    console.error('Błąd pobierania zamówień:', err);
    res.render('index', { title: 'Mój Sellmo', orders: [] });
  }
});

// --------------------------------------------------
// SEARCH
// --------------------------------------------------
app.get('/search', async (req, res) => {
  const nameQuery = req.query.name;
  if (!nameQuery) return res.redirect('/');
  try {
    const orders = await Order.find({ userName: new RegExp(nameQuery, 'i') }).sort({ timestamp: -1 });
    res.render('search', { orders, query: nameQuery });
  } catch (err) {
    console.error(err);
    res.render('search', { orders: [], query: nameQuery });
  }
});

// --------------------------------------------------
// ROUTES
// --------------------------------------------------
app.use(authRoutes);
app.use(botRoutes);

// --------------------------------------------------
// ADMIN PANEL
// --------------------------------------------------
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
    console.error(err);
    res.send('Błąd serwera');
  }
});

// --------------------------------------------------
// FACEBOOK WEBHOOK VERIFY
// --------------------------------------------------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log('GET /webhook query:', req.query);
  if (mode && token === process.env.VERIFY_TOKEN) {
    console.log('✅ Webhook zweryfikowany');
    return res.status(200).send(challenge);
  }
  console.log('❌ Błąd weryfikacji webhooka');
  res.sendStatus(403);
});

// --------------------------------------------------
// FACEBOOK WEBHOOK EVENTS
// --------------------------------------------------
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📩 Otrzymano zdarzenie z Facebooka:', JSON.stringify(body, null, 2));
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

        global.currentLiveVideoId = liveVideoId;
        const userName = from?.name || 'Anonimowy Klient';
        const keyword = '+1';

        console.log(`💬 Komentarz pod live ${liveVideoId}: "${message}" od ${userName}`);

        if (!message.includes(keyword)) continue;

        try {
          const existingOrder = await Order.findOne({ commentId });
          if (existingOrder) {
            console.log(`⏩ Komentarz ${commentId} już istnieje.`);
            continue;
          }

          const newOrder = new Order({
            commentId,
            userName,
            userId: from?.id || 'unknown',
            liveVideoId,
            productKeyword: keyword,
            quantity: 1,
            status: 'nowe'
          });
          await newOrder.save();
          console.log(`📦 Zapisano zamówienie dla ${userName}`);

          const replyMessage = process.env.ORDER_REPLY_MESSAGE || 'Dziękujemy za zamówienie!';
          try {
            await axios.post(
              `https://graph.facebook.com/v25.0/${commentId}/private_replies`,
              { message: replyMessage },
              { params: { access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN } }
            );
            console.log(`💬 Odpowiedziano na komentarz ${commentId}`);
          } catch (replyErr) {
            console.error('❌ Błąd odpowiedzi:', replyErr.response?.data || replyErr.message);
          }
        } catch (err) {
          console.error('❌ Błąd zapisu zamówienia:', err);
        }
      }
    }
  }
});

// --------------------------------------------------
// DB STATUS
// --------------------------------------------------
app.get('/db-status', (req, res) => {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'Rozłączona',
    1: 'Połączona',
    2: 'Łączenie...',
    3: 'Rozłączanie...'
  };
  res.json({
    status: states[state] || 'Nieznany',
    dbName: mongoose.connection.name || 'brak',
    error: mongoose.connection._connectionError?.message || null
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
