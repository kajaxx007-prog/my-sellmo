// routes/admin-products.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.redirect('/login');
    next();
}

// GET – formularz dodawania produktu
router.get('/admin/products/add', requireAuth, (req, res) => {
    res.render('admin-products-add');
});

// POST – zapis nowego produktu (dynamiczna siatka)
router.post('/admin/products/add', requireAuth, async (req, res) => {
    try {
        const { number, name, purchasePrice, sellingPrice, colors, sizes } = req.body;

        // Kolory i rozmiary dostajemy jako stringi oddzielone przecinkami – dzielimy je
        const colorList = colors.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const sizeList = sizes.split(',').map(s => s.trim()).filter(s => s.length > 0);

        const variants = [];

        for (const color of colorList) {
            for (const size of sizeList) {
                // Nazwa pola: stock_Kolor_Rozmiar (np. stock_Czarny_S)
                const fieldName = `stock_${color}_${size}`;
                const stockValue = parseInt(req.body[fieldName]) || 0;
                variants.push({
                    color: color,
                    size: size,
                    stock: stockValue,
                    reserved: 0
                });
            }
        }

        const product = new Product({
            number,
            name,
            purchasePrice: parseFloat(purchasePrice),
            sellingPrice: parseFloat(sellingPrice),
            variants
        });
        await product.save();

        res.redirect('/admin/products');
    } catch (err) {
        console.error('Błąd dodawania produktu:', err);
        res.render('admin-products-add', { error: err.message });
    }
});

// GET – lista produktów (bez zmian, tylko używamy widoku admin-products.ejs)
router.get('/admin/products', requireAuth, async (req, res) => {
    const products = await Product.find().sort({ number: 1 });
    let totalStock = 0;
    let totalPurchase = 0;
    products.forEach(p => {
        p.variants.forEach(v => {
            totalStock += v.stock;
            totalPurchase += v.stock * p.purchasePrice;
        });
    });
    res.render('admin-products', { products, totalStock, totalPurchase });
});

// POST – edycja pojedynczego wariantu
router.post('/admin/products/variant/:variantId', requireAuth, async (req, res) => {
    const { productId, stock } = req.body;
    await Product.findOneAndUpdate(
        { _id: productId, 'variants._id': req.params.variantId },
        { $set: { 'variants.$.stock': stock } }
    );
    res.redirect('/admin/products');
});

// routes/admin-products.js (dopisz do istniejącego pliku)

// GET – formularz edycji produktu
router.get('/admin/products/edit/:id', requireAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.redirect('/admin/products');
        res.render('admin-products-edit', { product, error: null, success: null });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products');
    }
});

// POST – zapis zmian edycji produktu
router.post('/admin/products/edit/:id', requireAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.redirect('/admin/products');

        // Aktualizuj podstawowe dane
        product.number = req.body.number;
        product.name = req.body.name;
        product.purchasePrice = parseFloat(req.body.purchasePrice);
        product.sellingPrice = parseFloat(req.body.sellingPrice);

        // Aktualizuj stany wariantów (indeksy od 0)
        const variantUpdates = req.body;
        product.variants.forEach((variant, index) => {
            const stockKey = `stock_${index}`;
            if (variantUpdates[stockKey] !== undefined) {
                const newStock = parseInt(variantUpdates[stockKey]) || 0;
                // Zachowaj zarezerwowane, zmień tylko dostępny stan
                variant.stock = newStock;
            }
        });

        await product.save();
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        const product = await Product.findById(req.params.id);
        res.render('admin-products-edit', { product, error: err.message, success: null });
    }
});

// POST – usuwanie produktu
router.post('/admin/products/delete/:id', requireAuth, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products');
    }
});

module.exports = router;