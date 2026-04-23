// models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    commentId: { type: String, unique: true, required: true },
    userName: { type: String, required: true },
    userId: { type: String },
    liveVideoId: { type: String, required: true },
    productKeyword: { type: String },
    quantity: { type: Number, default: 1 },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, default: 'nowe' }
});

module.exports = mongoose.model('Order', orderSchema);