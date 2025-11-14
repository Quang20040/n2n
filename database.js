const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI;

        if (!uri) {
            console.error("❌ Không tìm thấy MONGODB_URI trong .env");
            process.exit(1);
        }

        console.log("🔄 Đang kết nối MongoDB Atlas...");

        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000
        });

        console.log("✅ Đã kết nối MongoDB Atlas thành công!");
    } catch (err) {
        console.error("❌ Lỗi kết nối MongoDB:", err.message);
        setTimeout(connectDB, 5000); // thử lại sau 5s
    }
};

module.exports = connectDB;
