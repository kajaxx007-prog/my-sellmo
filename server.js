// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const axios = require('axios');

// Modele
const Order = require('./models/Order');
const User = require('./models/User');
const BotTemplate = require('./models/BotTemplate');
const Customer = require('./models/Customer');
const Product = require('./models/Product');

// Trasy
const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bot');
const productAdminRoutes = require('./routes/admin-products');
const orderAdminRoutes = require('./routes/admin-orders');

const { startScheduler, rescheduleTemplate } = require('./services/chatScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// NATYCHMIASTOWY HEALTHCHECK
// --------------------------------------------------
app.get('/ping', (req, res) => res.status(200).send('pong'));

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

botRoutes.setSendMessageCallback(sendMessageToLive);

// --------------------------------------------------
// POŁĄCZENIE Z MONGODB
// --------------------------------------------------
const dbUri = process.env.MONGODB_URI;
if (dbUri) {
  console.log('Łączę z MongoDB:', dbUri.replace(/:([^@]+)@/, ':*****@'));
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
// MIDDLEWARE
// --------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sesja w pamięci (wystarcza do pracy)
app.use(session({
  secret: process.env.SESSION_SECRET || 'bardzo-tajny-klucz',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// --------------------------------------------------
// PRZEKAZYWANIE STANU SESJI DO WIDOKÓW (navbar)
// --------------------------------------------------
app.use((req, res, next) => {
  res.locals.isAuthenticated = !!req.session.userId;
  res.locals.isAdmin = req.session.role === 'admin';
  res.locals.currentUser = req.session.username || null;
  next();
});

// --------------------------------------------------
// FUNKCJE POMOCNICZE
// --------------------------------------------------
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// --------------------------------------------------
// POLITYKA PRYWATNOŚCI
// --------------------------------------------------
// server.js
app.get('/privacy-policy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Polityka prywatności – Sellmo</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; color: #2c3e50; }
            h1 { color: #3498db; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
            h2 { color: #2c3e50; margin-top: 30px; }
            a { color: #3498db; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1; font-size: 0.9em; color: #7f8c8d; }
        </style>
    </head>
    <body>
        <h1>Polityka prywatności – Sellmo</h1>
        <p><strong>Data ostatniej aktualizacji:</strong> ${new Date().toISOString().split('T')[0]}</p>

        <h2>1. Informacje ogólne</h2>
        <p>Niniejsza polityka prywatności określa zasady przetwarzania i ochrony danych osobowych przekazanych przez Użytkowników w związku z korzystaniem z aplikacji Sellmo (zwanej dalej „Aplikacją”).</p>
        <p>Administratorem danych osobowych jest właściciel aplikacji Sellmo. Kontakt z Administratorem możliwy jest za pośrednictwem poczty elektronicznej: kajaxx007@gmail.com.</p>

        <h2>2. Zakres i cel zbierania danych</h2>
        <p>Aplikacja Sellmo automatyzuje proces przyjmowania zamówień podczas transmisji na żywo na platformie Facebook. W tym celu zbiera wyłącznie publicznie dostępne dane z komentarzy, które użytkownicy (klienci) samodzielnie publikują pod transmisjami na żywo, zawierające słowo kluczowe „+1”.</p>
        <p>Zbieramy następujące dane:</p>
        <ul>
            <li>imię i nazwisko (publiczny identyfikator użytkownika Facebook),</li>
            <li>identyfikator konta Facebook (Facebook ID),</li>
            <li>treść komentarza (w celu wyodrębnienia szczegółów zamówienia, takich jak numer produktu, kolor, rozmiar).</li>
        </ul>
        <p>Dane te są wykorzystywane wyłącznie w celu:</p>
        <ul>
            <li>utworzenia zamówienia w bazie danych i skojarzenia go z konkretnym klientem,</li>
            <li>nadania klientowi unikalnego, wewnętrznego identyfikatora (4-cyfrowego ID),</li>
            <li>wysyłania automatycznej, prywatnej odpowiedzi z potwierdzeniem zamówienia i informacją o sposobie sprawdzenia jego statusu,</li>
            <li>prowadzenia historii zamówień dostępnej dla Administratora w panelu aplikacji.</li>
        </ul>
        <p><strong>Podstawa prawna:</strong> Przetwarzanie danych odbywa się na podstawie art. 6 ust. 1 lit. b RODO (niezbędność do wykonania umowy sprzedaży, której stroną jest osoba składająca zamówienie) oraz art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora polegający na automatyzacji procesu sprzedaży i zapewnieniu sprawnej obsługi klienta).</p>

        <h2>3. Przechowywanie danych</h2>
        <p>Dane są przechowywane w bezpiecznej bazie danych MongoDB Atlas. Dostęp do bazy danych jest chroniony hasłem i zabezpieczony przed dostępem osób nieupoważnionych.</p>
        <p>Dane są przechowywane przez okres niezbędny do realizacji zamówienia oraz do czasu przedawnienia ewentualnych roszczeń z tytułu zawartej umowy sprzedaży, zgodnie z obowiązującymi przepisami prawa.</p>

        <h2>4. Udostępnianie danych</h2>
        <p>Dane osobowe Użytkowników nie są udostępniane żadnym podmiotom trzecim, z wyjątkiem sytuacji, gdy jest to niezbędne do realizacji zamówienia (np. przekazanie danych firmie kurierskiej w celu dostarczenia przesyłki) lub wymagane przepisami prawa.</p>
        <p>Podczas transmisji na żywo dane Użytkownika (imię i nazwisko) pozostają publicznie widoczne w komentarzach na platformie Facebook, co wynika z charakteru tej usługi. W takich przypadkach administratorem danych jest również Meta Platforms, Inc., a przetwarzanie odbywa się zgodnie z jej polityką prywatności dostępną na stronie: <a href="https://www.facebook.com/privacy/policy/" target="_blank">https://www.facebook.com/privacy/policy/</a>.</p>

        <h2>5. Prawa Użytkowników</h2>
        <p>Każdemu Użytkownikowi przysługuje prawo do:</p>
        <ul>
            <li>dostępu do swoich danych,</li>
            <li>sprostowania (poprawiania) swoich danych,</li>
            <li>usunięcia danych („prawo do bycia zapomnianym”),</li>
            <li>ograniczenia przetwarzania danych,</li>
            <li>przenoszenia danych,</li>
            <li>wniesienia sprzeciwu wobec przetwarzania danych,</li>
            <li>cofnięcia zgody na przetwarzanie danych w dowolnym momencie bez wpływu na zgodność z prawem przetwarzania, którego dokonano na podstawie zgody przed jej cofnięciem.</li>
        </ul>
        <p>Aby skorzystać z powyższych praw, należy skontaktować się z Administratorem za pośrednictwem poczty elektronicznej: kajaxx007@gmail.com.</p>
        <p>Użytkownikowi przysługuje również prawo wniesienia skargi do organu nadzorczego – Prezesa Urzędu Ochrony Danych Osobowych, jeśli uzna, że przetwarzanie danych narusza przepisy RODO.</p>

        <h2>6. Pliki cookies</h2>
        <p>Aplikacja Sellmo nie wykorzystuje plików cookies ani innych technologii śledzących do gromadzenia danych o użytkownikach.</p>

        <h2>7. Zmiany w polityce prywatności</h2>
        <p>Administrator zastrzega sobie prawo do wprowadzania zmian w niniejszej polityce prywatności. Wszelkie zmiany będą publikowane na tej stronie i wchodzą w życie z dniem ich opublikowania.</p>

        <h2>8. Kontakt</h2>
        <p>Wszelkie pytania dotyczące niniejszej polityki prywatności prosimy kierować na adres poczty elektronicznej: [twój adres e-mail].</p>

        <p><a href="/">← Powrót do strony głównej</a></p>

        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Sellmo. Wszelkie prawa zastrzeżone.</p>
        </div>
    </body>
    </html>
  `);
});

// --------------------------------------------------
// STRONA GŁÓWNA – BEZ WYŚWIETLANIA ZAMÓWIEŃ
// --------------------------------------------------
app.get('/', (req, res) => {
  res.render('index', { title: 'Mój Sellmo', orders: [] });
});

// --------------------------------------------------
// WYSZUKIWARKA (po nazwisku LUB numerze ID)
// --------------------------------------------------
app.get('/search', async (req, res) => {
  const query = req.query.name?.trim();
  if (!query) return res.redirect('/');

  try {
    let orders;

    // Jeśli zapytanie składa się tylko z cyfr -> szukaj po shortId
    if (/^\d+$/.test(query)) {
      const customer = await Customer.findOne({ shortId: parseInt(query) });
      if (customer) {
        orders = await Order.find({ customerId: customer._id })
          .sort({ createdAt: -1 })
          .populate('customerId');
      } else {
        orders = [];
      }
    } else {
      // Standardowe wyszukiwanie po nazwisku
      orders = await Order.find({ customerName: new RegExp(query, 'i') })
        .sort({ createdAt: -1 })
        .populate('customerId');
    }

    // Grupowanie
    const grouped = new Map();
    orders.forEach(order => {
      const createdAt = order.createdAt || new Date();
      const dateKey = createdAt.toISOString().split('T')[0];
      const key = `${order.customerId?._id || 'unknown'}_${dateKey}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          customerName: order.customerName,
          customerShortId: order.customerId?.shortId || null,
          date: createdAt.toLocaleDateString(),
          items: [],
          totalAmount: 0,
          orders: []   // tymczasowo przetrzymujemy obiekty zamówień
        });
      }

      const group = grouped.get(key);
      group.orders.push(order);
      group.items.push(...order.items);
      group.totalAmount += order.totalAmount;
    });

    // Przekształć na tablicę i pobierz statusy bezpośrednio z zamówień
    const groupedOrders = Array.from(grouped.values()).map(group => {
      const statuses = group.orders.map(o => o.status);
      const allSameStatus = statuses.every(s => s === statuses[0]);
      return {
        customerName: group.customerName,
        customerShortId: group.customerShortId,
        date: group.date,
        items: group.items,
        totalAmount: group.totalAmount,
        orderIds: group.orders.map(o => o._id),
        statuses,
        allSameStatus
      };
    });

    res.render('search', { groupedOrders, query });
  } catch (err) {
    console.error(err);
    res.render('search', { groupedOrders: [], query });
  }
});

// --------------------------------------------------
// TRASY AUTENTYKACJI I CHATBOTA
// --------------------------------------------------
app.use(authRoutes);
app.use(botRoutes);

// --------------------------------------------------
// PANEL ADMINA (przekierowanie)
// --------------------------------------------------
app.get('/admin', requireAuth, (req, res) => {
  res.redirect('/admin/orders');
});

// --------------------------------------------------
// NOWE TRASY DLA PRODUKTÓW I ZAMÓWIEŃ
// --------------------------------------------------
app.use(productAdminRoutes);
app.use(orderAdminRoutes);

// --------------------------------------------------
// WEBHOOK FACEBOOKA – WERYFIKACJA
// --------------------------------------------------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log('GET /webhook:', req.query);
  if (mode && token === process.env.VERIFY_TOKEN) {
    console.log('✅ Webhook zweryfikowany');
    return res.status(200).send(challenge);
  }
  console.log('❌ Błąd weryfikacji');
  res.sendStatus(403);
});

// --------------------------------------------------
// WEBHOOK – ODBIÓR KOMENTARZY
// --------------------------------------------------
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📩 Otrzymano zdarzenie:', JSON.stringify(body, null, 2));
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
        const fbId = from?.id;
        const customerName = from?.name || 'Anonimowy Klient';

        const keyword = '+1';
        if (!message.includes(keyword)) continue;

        console.log(`💬 ${customerName}: "${message}"`);

        try {
          // 1. Klient – unikalne ID
          let customer = await Customer.findOne({ facebookId: fbId });
          if (!customer) {
            const lastCustomer = await Customer.findOne({ shortId: { $exists: true } }).sort({ shortId: -1 });
            const nextId = lastCustomer ? lastCustomer.shortId + 1 : 1000;
            customer = new Customer({
              facebookId: fbId,
              name: customerName,
              shortId: nextId
            });
            await customer.save();
          } else if (!customer.shortId) {
            const lastCustomer = await Customer.findOne({ shortId: { $exists: true } }).sort({ shortId: -1 });
            const nextId = lastCustomer ? lastCustomer.shortId + 1 : 1000;
            customer.shortId = nextId;
            await customer.save();
          }

          // 2. Parsowanie parametrów
          const params = message.replace(keyword, '').trim().split(',').map(s => s.trim().toLowerCase());
          const productNumber = params[0];
          let color = params[1];
          const size = params[2];

          if (!productNumber || !color || !size) {
            console.log('⚠️ Niepełny format komentarza (oczekiwano: +1 123, zielona, xl)');
            return;
          }

          const colorMap = {
            'zielona': 'zielony', 'czerwona': 'czerwony', 'niebieska': 'niebieski',
            'czarna': 'czarny', 'biała': 'biały', 'bialy': 'biały', 'biala': 'biały',
            'żółta': 'żółty', 'fioletowa': 'fioletowy'
          };
          const normalizedColor = colorMap[color] || color;

          // 3. Produkt i wariant
          const product = await Product.findOne({ number: productNumber });
          if (!product) {
            console.log(`⚠️ Produkt ${productNumber} nie istnieje`);
            return;
          }

          const variant = product.variants.find(v =>
            v.color.toLowerCase() === normalizedColor &&
            v.size.toLowerCase() === size
          );

          if (!variant) {
            console.log(`⚠️ Brak wariantu ${normalizedColor} / ${size}`);
            console.log('Dostępne:', product.variants.map(v => `${v.color}/${v.size}`).join(', '));
            return;
          }

          if (variant.stock < 1) {
            console.log(`⚠️ Brak na stanie: ${normalizedColor} ${size}`);
            return;
          }

          // 4. Aktualizacja stanu
          variant.stock -= 1;
          variant.reserved += 1;
          await product.save();

          // 5. Zamówienie
          const order = new Order({
            customerId: customer._id,
            customerName: customer.name,
            liveVideoId,
            items: [{
              productId: product._id,
              variantId: variant._id,
              productName: product.name,
              color: variant.color,
              size: variant.size,
              price: product.sellingPrice,
              quantity: 1
            }],
            totalAmount: product.sellingPrice,
            commentId: commentId
          });
          await order.save();
          console.log(`📦 Zamówienie #${order._id} dla ${customerName}`);

          // 6. Automatyczna odpowiedź
          const appUrl = process.env.APP_URL || 'http://localhost:3000';
          const reply = `Zamówienie przyjęte. Sprawdź status na ${appUrl}/?id=${customer.shortId}. Twoje ID: ${customer.shortId}`;
          try {
            await axios.post(
              `https://graph.facebook.com/v25.0/${commentId}/private_replies`,
              { message: reply },
              { params: { access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN } }
            );
            console.log(`💬 Odpowiedź wysłana`);
          } catch (err) {
            console.error('❌ Błąd odpowiedzi:', err.response?.data || err.message);
          }
        } catch (err) {
          console.error('❌ Błąd przetwarzania zamówienia:', err);
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
  const states = { 0: 'Rozłączona', 1: 'Połączona', 2: 'Łączenie...', 3: 'Rozłączanie...' };
  res.json({
    status: states[state] || 'Nieznany',
    dbName: mongoose.connection.name || 'brak',
    error: mongoose.connection._connectionError?.message || null
  });
});

// --------------------------------------------------
// START SERWERA
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
