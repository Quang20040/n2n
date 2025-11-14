# VaultChat - Ứng dụng Chat An Toàn

Ứng dụng chat real-time với mã hóa end-to-end, lưu trữ trên MongoDB và các tính năng như app chat thực thụ.

## Tính năng

### 🔒 Bảo mật
- ✅ Mã hóa end-to-end với Web Crypto API
- ✅ RSA-OAEP encryption (2048 bits) cho tin nhắn
- ✅ AES-GCM encryption (256 bits) cho payload
- ✅ Private key chỉ tồn tại trên client, không bao giờ gửi lên server
- ✅ Server chỉ routing tin nhắn đã mã hóa, không thể đọc nội dung

### 💬 Chat Features
- ✅ Real-time chat với Socket.IO
- ✅ **Lưu trữ tin nhắn trên MongoDB** - xem lại lịch sử sau khi reload
- ✅ **Tin nhắn offline** - gửi tin nhắn kể cả khi người nhận offline, họ sẽ nhận khi online
- ✅ **Danh bạ tự động** - tự động lưu người đã chat vào danh bạ
- ✅ Typing indicators - hiển thị khi ai đó đang gõ
- ✅ Message status - hiển thị trạng thái đã gửi/đã nhận
- ✅ User avatars với màu sắc tự động
- ✅ Timestamps thông minh

### 🎨 UI/UX
- ✅ Giao diện hiện đại với dark/light theme
- ✅ Smooth animations và transitions
- ✅ Auto-reconnect khi mất kết nối
- ✅ Connection status indicator
- ✅ Toast notifications
- ✅ Responsive design

## Cài đặt

### Yêu cầu
- Node.js (v14 trở lên)
- MongoDB (local hoặc MongoDB Atlas)

### Bước 1: Cài đặt dependencies
```bash
npm install
```

### Bước 2: Cấu hình MongoDB

Tạo file `.env` trong thư mục gốc:
```env
MONGODB_URI=mongodb://localhost:27017/e2e-chat
PORT=3000
```

Hoặc sử dụng MongoDB Atlas:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/e2e-chat
PORT=3000
```

### Bước 3: Khởi động MongoDB

Nếu dùng MongoDB local:
```bash
# Windows
mongod

# Mac/Linux
sudo systemctl start mongod
# hoặc
brew services start mongodb-community
```

### Bước 4: Chạy ứng dụng

Development mode (tự động restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### Bước 5: Mở trình duyệt
```
http://localhost:3000
```

## Cấu trúc Database

### Collections

1. **Users**: Lưu thông tin người dùng và public key
   - username
   - publicKey
   - isOnline
   - lastSeen

2. **Messages**: Lưu tin nhắn đã mã hóa
   - messageId
   - from
   - to
   - encryptedMessage
   - timestamp
   - status (pending/delivered/read)
   - conversationId

3. **Conversations**: Quản lý cuộc trò chuyện
   - conversationId
   - participants
   - lastMessageTime
   - unreadCount

4. **Contacts**: Danh bạ người dùng
   - userId
   - contactUsername
   - nickname
   - lastContacted

## Cách hoạt động

### Mã hóa End-to-End

1. **Khởi tạo**: Mỗi user tự động tạo cặp khóa RSA-OAEP (2048 bits)
2. **Chia sẻ Public Key**: Public key được chia sẻ với users khác qua server
3. **Mã hóa tin nhắn**: Sử dụng RSA-OAEP với public key của người nhận
4. **Lưu trữ**: Tin nhắn đã mã hóa được lưu vào MongoDB
5. **Giải mã**: Chỉ người nhận có private key mới có thể giải mã

### Tin nhắn Offline

- Khi gửi tin nhắn cho người offline, tin nhắn được lưu vào MongoDB với status "pending"
- Khi người nhận online, server tự động gửi tất cả tin nhắn pending
- Người nhận có thể xem lại toàn bộ lịch sử trò chuyện

### Danh bạ

- Tự động thêm vào danh bạ khi có tin nhắn đầu tiên
- Hiển thị trong sidebar bên phải
- Sắp xếp theo thời gian liên hệ gần nhất

## Công nghệ sử dụng

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express
- **Database**: MongoDB với Mongoose
- **Real-time**: Socket.IO
- **Encryption**: Web Crypto API (RSA-OAEP, AES-GCM)

## API Endpoints (Socket.IO)

### Client → Server

- `join`: Đăng nhập và kết nối
- `dm`: Gửi tin nhắn
- `typing`: Báo đang gõ
- `stopTyping`: Dừng gõ
- `get:history`: Lấy lịch sử trò chuyện
- `get:contacts`: Lấy danh bạ
- `add:contact`: Thêm vào danh bạ

### Server → Client

- `users`: Danh sách users online
- `dm`: Nhận tin nhắn mới
- `dm:ack`: Xác nhận tin nhắn đã gửi
- `typing`: Ai đó đang gõ
- `stopTyping`: Ai đó dừng gõ
- `history`: Lịch sử trò chuyện
- `contacts`: Danh sách danh bạ
- `contact:added`: Đã thêm vào danh bạ

## Lưu ý

- Ứng dụng này là demo, không nên sử dụng cho mục đích production mà không có các biện pháp bảo mật bổ sung
- Cần HTTPS trong môi trường production
- Nên implement key verification để đảm bảo public key authenticity
- MongoDB cần được bảo mật tốt trong production

## License

MIT
