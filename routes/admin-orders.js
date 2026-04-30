// routes/admin-orders.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// GET – lista zamówień pogrupowana (admin)
router.get('/admin/orders', requireAuth, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).populate('customerId');

    const grouped = new Map();
    orders.forEach(order => {
      const createdAt = order.createdAt || new Date();
      const dateKey = createdAt.toISOString().split('T')[0];
      const key = `${order.customerId?._id || 'unknown'}_${dateKey}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          customerName: order.customerName,
          customerShortId: order.customerId?.shortId || null,
          date: createdAt.toLocaleDateString(),
          items: [],
          totalAmount: 0,
          orders: []   // przechowujemy oryginalne zamówienia
        });
      }

      const group = grouped.get(key);
      group.orders.push(order);
      group.items.push(...order.items);
      group.totalAmount += order.totalAmount;
    });

    const groupedOrders = Array.from(grouped.values()).map(group => {
      const statuses = group.orders.map(o => o.status);
      const allSameStatus = statuses.every(s => s === statuses[0]);
      return {
        customerName: group.customerName,
        customerShortId: group.customerShortId,
        date: group.date,
        items: group.items,
        totalAmount: group.totalAmount,
        orderIds: group.orders.map(o => o._id),
        statuses,
        allSameStatus
      };
    });

    // Mapa statusów dla formularzy zmiany (dla każdego zamówienia osobno)
    const orderStatusMap = {};
    orders.forEach(order => {
      orderStatusMap[order._id.toString()] = order.status;
    });

    res.render('admin-orders', { groupedOrders, orderStatusMap });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

// POST – zmiana statusu
router.post('/admin/orders/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.redirect('/admin/orders');

    if (status === 'anulowane' && order.status !== 'anulowane') {
      for (const item of order.items) {
        await Product.findOneAndUpdate(
          { _id: item.productId, 'variants._id': item.variantId },
          { $inc: { 'variants.$.reserved': -item.quantity, 'variants.$.stock': item.quantity } }
        );
      }
    }

    order.status = status;
    await order.save({ validateModifiedOnly: true });
  } catch (err) {
    console.error('Błąd zmiany statusu:', err);
  }
  res.redirect('/admin/orders');
});

module.exports = router;