import express from 'express';
import Order from '../models/Order.js';

const router = express.Router();

// Create a new order
router.post('/', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { items, totalAmount, shippingAddress, paymentStatus } = req.body;

        const newOrder = new Order({
            user: req.user._id,
            items,
            totalAmount,
            shippingAddress,
            paymentStatus: paymentStatus || 'pending'
        });

        const savedOrder = await newOrder.save();

        res.status(201).json({
            success: true,
            order: savedOrder,
            message: 'Order placed successfully'
        });
    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order: ' + error.message,
            error: error.message
        });
    }
});

// Get user's orders
router.get('/my-orders', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });

        res.json({
            success: true,
            orders
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
