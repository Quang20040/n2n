// E:\n2n\models\Conversation.js
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
    participants: {
        type: [String],
        required: true,
        index: true
    },
    conversationId: {
        type: String,
        required: true,
        unique: true
    },
    lastMessage: {
        type: String,
        default: ""
    },
    lastMessageTime: {
        type: Date,
        default: Date.now
    },
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Tạo conversationId từ participants
conversationSchema.statics.getConversationId = function(user1, user2) {
    return [user1, user2].sort().join("_");
};

module.exports = mongoose.model("Conversation", conversationSchema);

