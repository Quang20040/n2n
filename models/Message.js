// E:\n2n\models\Message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    from: {
        type: String,
        required: true,
        index: true
    },
    to: {
        type: String,
        required: true,
        index: true
    },
    encryptedMessage: {
        type: Object,
        required: true
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    status: {
        type: String,
        enum: ["pending", "delivered", "read"],
        default: "pending"
    },
    conversationId: {
        type: String,
        required: true,
        index: true
    }
}, {
    timestamps: true
});

// Index để tìm tin nhắn nhanh hơn
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ to: 1, status: 1 });

module.exports = mongoose.model("Message", messageSchema);

