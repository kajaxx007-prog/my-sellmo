// models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    commentId: { type: String, unique: true, required: true }, // ID komentarza z Facebooka
    userName: { type: String, required: true },
    userId: { type: String }, // ID użytkownika Facebook
    liveVideoId: { type: String, required: true },
    productKeyword: { type: String }, // np. "+1"
    quantity: { type: Number, default: 1 },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, default: 'nowe' } // np. 'nowe', 'opłacone', 'wysłane'
});

module.exports = mongoose.model('Order', orderSchema);