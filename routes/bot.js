// routes/bot.js
const express = require('express');
const router = express.Router();
const BotTemplate = require('../models/BotTemplate');
const { rescheduleTemplate } = require('../services/chatScheduler');

// Middleware uwierzytelniania
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
}

// Przekazanie funkcji wysyłającej do schedulera
let sendMessageCallback;
router.setSendMessageCallback = (fn) => {
    sendMessageCallback = fn;
};

// GET – panel zarządzania chatbotem
router.get('/admin/bot', requireAuth, async (req, res) => {
    const templates = await BotTemplate.find().sort({ createdAt: 1 });
    res.render('bot', { templates });
});

// POST – dodaj nowy szablon
router.post('/admin/bot/add', requireAuth, async (req, res) => {
    const { content, intervalMinutes } = req.body;
    const template = await BotTemplate.create({ content, intervalMinutes });
    if (sendMessageCallback) {
        rescheduleTemplate(template, sendMessageCallback);
    }
    res.redirect('/admin/bot');
});

// POST – edytuj szablon
router.post('/admin/bot/edit/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { content, intervalMinutes, active } = req.body;
    const template = await BotTemplate.findByIdAndUpdate(id, {
        content,
        intervalMinutes,
        active: active === 'on'
    }, { new: true });
    if (sendMessageCallback) {
        if (template.active) {
            rescheduleTemplate(template, sendMessageCallback);
        } else {
            // Jeśli wyłączono, zatrzymaj zadanie (w naszym uproszczeniu po prostu przeładuj – scheduler sam sprawdzi)
            rescheduleTemplate(template, sendMessageCallback);
        }
    }
    res.redirect('/admin/bot');
});

// GET – usuń szablon
router.get('/admin/bot/delete/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    await BotTemplate.findByIdAndDelete(id);
    // Po usunięciu przeładuj wszystkie szablony (scheduler ponownie odczyta aktywne)
    if (sendMessageCallback) {
        const templates = await BotTemplate.find({ active: true });
        const { startScheduler } = require('../services/chatScheduler');
        await startScheduler(sendMessageCallback, true); // parametr forceRestart
    }
    res.redirect('/admin/bot');
});

module.exports = router;