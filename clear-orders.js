// clear-orders.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Połączono z MongoDB');
    
    // 1. Usuwanie wszystkich zamówień
    const ordersResult = await mongoose.connection.db.collection('orders').deleteMany({});
    console.log(`✅ Usunięto ${ordersResult.deletedCount} zamówień.`);
    
    // 2. Resetowanie rezerwacji we wszystkich wariantach
    const productsResult = await Product.updateMany(
      {},
      { $set: { 'variants.$[].reserved': 0 } }
    );
    console.log(`✅ Zresetowano rezerwacje dla ${productsResult.modifiedCount} produktów.`);
    
    // 3. (opcjonalnie) Jeżeli chcesz również przywrócić stan magazynowy do pierwotnej wartości,
    //    odkomentuj poniższą linię i zastąp X konkretną liczbą:
    // await Product.updateMany({}, { $set: { 'variants.$[].stock': 10 } });
    
    console.log('🎉 Baza wyczyszczona – możesz nagrywać screencast.');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Błąd:', err);
    process.exit(1);
  });