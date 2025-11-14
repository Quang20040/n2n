/**
 * E2E Chat Server với MongoDB
 * Full version với offline messaging và contacts
 */

require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const session = require("express-session");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const connectDB = require("./config/database");
const User = require("./models/User");
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const Contact = require("./models/Contact");

// Kết nối MongoDB
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(express.static(path.join(__dirname, "public")));

// Middleware để kiểm tra MongoDB connection
function checkMongoConnection(req, res, next) {
    const readyState = mongoose.connection.readyState;
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (readyState !== 1) {
        return res.status(503).json({ 
            error: "Database chưa sẵn sàng. Vui lòng thử lại sau.",
            readyState: readyState
        });
    }
    next();
}

// Middleware để verify JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Chưa đăng nhập" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Token không hợp lệ" });
        }
        req.user = user;
        next();
    });
}

// API Routes
// Đăng ký
app.post("/api/register", checkMongoConnection, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin" });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: "Tên đăng nhập phải từ 3-20 ký tự" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Mật khẩu phải có ít nhất 6 ký tự" });
        }

        // Kiểm tra username đã tồn tại chưa
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: "Tên đăng nhập đã tồn tại" });
        }

        // Tạo user mới
        const user = new User({
            username: username.toLowerCase(),
            password
        });

        await user.save();

        // Tạo JWT token
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.status(201).json({
            message: "Đăng ký thành công",
            token,
            user: {
                id: user._id,
                username: user.username
            }
        });
    } catch (error) {
        console.error("Lỗi đăng ký:", error);
        if (error.code === 11000) {
            return res.status(400).json({ error: "Tên đăng nhập đã tồn tại" });
        }
        res.status(500).json({ error: "Lỗi server" });
    }
});

// Đăng nhập
app.post("/api/login", checkMongoConnection, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin" });
        }

        // Tìm user
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng" });
        }

        // Kiểm tra password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng" });
        }

        // Tạo JWT token
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Cập nhật lastSeen
        user.lastSeen = new Date();
        await user.save();

        res.json({
            message: "Đăng nhập thành công",
            token,
            user: {
                id: user._id,
                username: user.username
            }
        });
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        res.status(500).json({ error: "Lỗi server" });
    }
});

// Kiểm tra token
app.get("/api/verify", checkMongoConnection, authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select("-password");
        if (!user) {
            return res.status(404).json({ error: "User không tồn tại" });
        }
        res.json({ user: { id: user._id, username: user.username } });
    } catch (error) {
        res.status(500).json({ error: "Lỗi server" });
    }
});

// Danh sách user online: username → { socketId, publicKey }
const users = new Map();

function getUsersSnapshot() {
    return Array.from(users.entries()).map(([username, info]) => ({
        username,
        publicKey: info.publicKey
    }));
}

function broadcastUsers() {
    io.emit("users", getUsersSnapshot());
}

// Helper để kiểm tra MongoDB connection
function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}

io.on("connection", socket => {
    console.log("🔗 New connection:", socket.id);

    // User join
    socket.on("join", async ({ username, publicKey }) => {
        if (!username || !publicKey) return;

        users.set(username, { socketId: socket.id, publicKey });

        // Kiểm tra MongoDB connection
        if (!isMongoConnected()) {
            console.warn("⚠️ MongoDB chưa kết nối, bỏ qua cập nhật user và tin nhắn offline");
            console.log(`🟢 User joined (offline mode): ${username}`);
            broadcastUsers();
            return;
        }

        // Cập nhật user trong DB
        try {
            await User.findOneAndUpdate(
                { username: username.toLowerCase() },
                {
                    username: username.toLowerCase(),
                    publicKey,
                    isOnline: true,
                    lastSeen: new Date()
                },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error("Lỗi cập nhật user:", error);
        }

        // Gửi tin nhắn offline nếu có
        try {
            const offlineMessages = await Message.find({
                to: username.toLowerCase(),
                status: "pending"
            }).sort({ timestamp: 1 }).limit(50);

            for (const msg of offlineMessages) {
                socket.emit("dm", {
                    from: msg.from,
                    encryptedMessage: msg.encryptedMessage,
                    timestamp: msg.timestamp,
                    messageId: msg.messageId
                });
                // Đánh dấu đã gửi
                msg.status = "delivered";
                await msg.save();
            }
        } catch (error) {
            console.error("Lỗi gửi tin nhắn offline:", error);
        }

        console.log(`🟢 User joined: ${username}`);
        broadcastUsers();
    });

    // Nhận tin nhắn DM
    socket.on("dm", async ({ messageId, from, to, encryptedMessage, timestamp }) => {
        if (!messageId || !from || !to || !encryptedMessage) return;

        const sender = users.get(from);
        if (!sender) return;

        const conversationId = Conversation.getConversationId(from.toLowerCase(), to.toLowerCase());
        const msgTime = timestamp ? new Date(timestamp) : new Date();

        // Kiểm tra MongoDB connection
        if (!isMongoConnected()) {
            console.warn("⚠️ MongoDB chưa kết nối, không thể lưu tin nhắn");
            socket.emit("dm:error", { error: "Database chưa sẵn sàng" });
            return;
        }

        // Lưu tin nhắn vào DB
        try {
            const message = new Message({
                messageId,
                from: from.toLowerCase(),
                to: to.toLowerCase(),
                encryptedMessage,
                timestamp: msgTime,
                conversationId,
                status: "pending"
            });
            await message.save();

            // Cập nhật conversation
            await Conversation.findOneAndUpdate(
                { conversationId },
                {
                    conversationId,
                    participants: [from.toLowerCase(), to.toLowerCase()].sort(),
                    lastMessageTime: msgTime,
                    updatedAt: new Date()
                },
                { upsert: true, new: true }
            );

            // Thêm vào danh bạ tự động
            try {
                await Contact.findOneAndUpdate(
                    { userId: from.toLowerCase(), contactUsername: to.toLowerCase() },
                    {
                        userId: from.toLowerCase(),
                        contactUsername: to.toLowerCase(),
                        lastContacted: msgTime
                    },
                    { upsert: true, new: true }
                );
                await Contact.findOneAndUpdate(
                    { userId: to.toLowerCase(), contactUsername: from.toLowerCase() },
                    {
                        userId: to.toLowerCase(),
                        contactUsername: from.toLowerCase(),
                        lastContacted: msgTime
                    },
                    { upsert: true, new: true }
                );
            } catch (contactError) {
                console.warn("Lỗi cập nhật danh bạ:", contactError);
            }

            // Gửi tin nhắn nếu receiver online
            const receiver = users.get(to);
            if (receiver) {
                message.status = "delivered";
                await message.save();

                io.to(receiver.socketId).emit("dm", {
                    from,
                    encryptedMessage,
                    timestamp: msgTime.getTime(),
                    messageId
                });
            }

            // Gửi ACK cho sender
            io.to(sender.socketId).emit("dm:ack", {
                messageId,
                to,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error("Lỗi lưu tin nhắn:", error);
        }
    });

    // Typing
    socket.on("typing", ({ from, to }) => {
        const receiver = users.get(to);
        if (!receiver) return;
        io.to(receiver.socketId).emit("typing", { from });
    });

    socket.on("stopTyping", ({ from, to }) => {
        const receiver = users.get(to);
        if (!receiver) return;
        io.to(receiver.socketId).emit("stopTyping", { from });
    });

    // Lấy lịch sử trò chuyện
    socket.on("get:history", async ({ username, withUser, limit = 50 }) => {
        if (!username || !withUser) return;

        if (!isMongoConnected()) {
            socket.emit("history", { conversationId: "", messages: [] });
            return;
        }

        try {
            const conversationId = Conversation.getConversationId(
                username.toLowerCase(),
                withUser.toLowerCase()
            );
            const messages = await Message.find({ conversationId })
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean();

            socket.emit("history", {
                conversationId,
                messages: messages.reverse()
            });
        } catch (error) {
            console.error("Lỗi lấy lịch sử:", error);
        }
    });

    // Lấy danh bạ
    socket.on("get:contacts", async ({ username }) => {
        if (!username) return;

        if (!isMongoConnected()) {
            socket.emit("contacts", { contacts: [] });
            return;
        }

        try {
            const contacts = await Contact.find({ userId: username.toLowerCase() })
                .sort({ lastContacted: -1 })
                .lean();

            socket.emit("contacts", { contacts });
        } catch (error) {
            console.error("Lỗi lấy danh bạ:", error);
        }
    });

    // Thêm vào danh bạ
    socket.on("add:contact", async ({ username, contactUsername, nickname }) => {
        if (!username || !contactUsername) return;

        if (!isMongoConnected()) {
            socket.emit("contact:error", { error: "Database chưa sẵn sàng" });
            return;
        }

        try {
            const contact = await Contact.findOneAndUpdate(
                { userId: username.toLowerCase(), contactUsername: contactUsername.toLowerCase() },
                {
                    userId: username.toLowerCase(),
                    contactUsername: contactUsername.toLowerCase(),
                    nickname: nickname || contactUsername,
                    lastContacted: new Date()
                },
                { upsert: true, new: true }
            );

            socket.emit("contact:added", { contact });
        } catch (error) {
            console.error("Lỗi thêm danh bạ:", error);
            socket.emit("contact:error", { error: error.message });
        }
    });

    // User disconnect
    socket.on("disconnect", async () => {
        let disconnected = null;
        for (const [username, info] of users.entries()) {
            if (info.socketId === socket.id) disconnected = username;
        }

        if (disconnected) {
            users.delete(disconnected);
            
            // Cập nhật trạng thái offline trong DB
            if (!isMongoConnected()) {
                console.log(`🔴 User left (offline mode): ${disconnected}`);
                broadcastUsers();
                return;
            }

            try {
                await User.findOneAndUpdate(
                    { username: disconnected.toLowerCase() },
                    { isOnline: false, lastSeen: new Date() }
                );
            } catch (error) {
                console.error("Lỗi cập nhật trạng thái:", error);
            }

            console.log(`🔴 User left: ${disconnected}`);
            broadcastUsers();
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Server chạy: http://localhost:${PORT}`);
});
