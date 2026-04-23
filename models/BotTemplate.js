// models/BotTemplate.js
const mongoose = require('mongoose');

const botTemplateSchema = new mongoose.Schema({
    content: { type: String, required: true },
    intervalMinutes: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BotTemplate', botTemplateSchema);