// E:\n2n\models\Contact.js
const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    contactUsername: {
        type: String,
        required: true
    },
    nickname: {
        type: String,
        default: ""
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    lastContacted: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Đảm bảo mỗi user chỉ có một contact với một username
contactSchema.index({ userId: 1, contactUsername: 1 }, { unique: true });

module.exports = mongoose.model("Contact", contactSchema);

