// models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    facebookId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    shortId: { type: Number, unique: true, sparse: true }, // unikalny 4-cyfrowy identyfikator
    email: { type: String, default: '' },
    phone: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);