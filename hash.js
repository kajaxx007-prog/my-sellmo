require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Połączono z MongoDB');

    const user = new User({
      username: 'admin',
      password: 'TwojeNoweHaslo',
      role: 'admin'
    });

    await user.save();
    console.log('✅ Konto administratora utworzone!');
    console.log('Login: admin');
    console.log('Hasło: TwojeNoweHaslo');
    process.exit(0);
  })
  .catch(err => {
    console.error('Błąd:', err);
    process.exit(1);
  });
