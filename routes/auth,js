// routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// GET – formularz logowania
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// POST – obsługa logowania
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user || !(await user.comparePassword(password))) {
            return res.render('login', { error: 'Nieprawidłowe dane logowania' });
        }
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Wystąpił błąd serwera' });
    }
});

// Wylogowanie
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

module.exports = router;