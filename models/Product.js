const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
    color: { type: String, required: true },
    size: { type: String, required: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
    reserved: { type: Number, default: 0 } // towary złożone w zamówieniach, ale jeszcze nieopłacone
}, { _id: true });

const productSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true }, // np. "123"
    name: { type: String, required: true },                 // "Bluzka"
    purchasePrice: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },
    variants: [variantSchema]
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);