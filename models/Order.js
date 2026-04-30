const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: String,
    color: String,
    size: String,
    price: Number,     // cena sprzedaży z momentu zamówienia
    quantity: { type: Number, default: 1 }
});

const orderSchema = new mongoose.Schema({
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    liveVideoId: { type: String, required: true },
    items: [orderItemSchema],
    status: {
        type: String,
        enum: ['nieopłacone', 'opłacone', 'wysłane', 'gotowe do odbioru', 'anulowane'],
        default: 'nieopłacone'
    },
    totalAmount: { type: Number, default: 0 },
    commentId: { type: String, unique: true } // opcjonalnie, do deduplikacji
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);