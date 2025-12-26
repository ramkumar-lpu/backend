import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: String,
        unique: true,
        default: () => 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
    },
    items: [{
        design: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Design'
        },
        // For standard templates without custom design
        templateId: mongoose.Schema.Types.Mixed, // Allow String "custom" or Number IDs
        name: String,
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true
        },
        customization: mongoose.Schema.Types.Mixed // Allow object with description or other fields
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    shippingAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    orderStatus: {
        type: String,
        enum: ['processing', 'shipped', 'delivered', 'cancelled'],
        default: 'processing'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Order', orderSchema);
