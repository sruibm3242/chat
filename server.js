const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const db = require('./db');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('.'));
app.use(express.json());

// تسجيل مستخدم
app.post('/register', (req, res) => {
    const { username, voicePrint } = req.body;
    db.run(`INSERT INTO users (username, voicePrint, lastSeen, isOnline) VALUES (?, ?, ?, ?)`,
        [username, voicePrint, Date.now(), 1],
        function (err) {
            if (err) return res.status(400).json({ error: 'Username exists' });
            res.json({ success: true, userId: this.lastID });
        });
});

// تسجيل دخول بصمة وجه
app.post('/login/face', (req, res) => {
    const { username, credentialId } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND faceIdKey = ?`, [username, credentialId], (err, user) => {
        if (!user) return res.status(401).json({ error: 'Invalid Face ID' });
        res.json({ success: true, userId: user.id, username: user.username });
    });
});

// تسجيل دخول بصوتي
app.post('/login/voice', (req, res) => {
    const { username, voicePrint } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND voicePrint = ?`, [username, voicePrint], (err, user) => {
        if (!user) return res.status(401).json({ error: 'Invalid Voice Print' });
        res.json({ success: true, userId: user.id, username: user.username });
    });
});

// جلب المفتاح العام للمستخدم
app.get('/user/:id', (req, res) => {
    db.get(`SELECT publicKey FROM users WHERE id = ?`, [req.params.id], (err, row) => {
        res.json({ publicKey: row?.publicKey || null });
    });
});

// إضافة صديق
app.post('/friend/request', (req, res) => {
    const { userId, friendUsername } = req.body;
    db.get(`SELECT id FROM users WHERE username = ?`, [friendUsername], (err, friend) => {
        if (!friend) return res.json({ success: false, message: "User not found" });
        db.run(`INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')`, [userId, friend.id]);
        res.json({ success: true });
    });
});

// جلب الأصدقاء
app.get('/friends/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(`
        SELECT u.username, u.isOnline, u.lastSeen 
        FROM friends f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ? AND f.status = 'accepted'
    `, [userId], (err, rows) => {
        res.json(rows);
    });
});

// تحديث الاتصال
function updateOnlineStatus(userId, isOnline) {
    db.run(`UPDATE users SET isOnline = ?, lastSeen = ? WHERE id = ?`, [isOnline, Date.now(), userId]);
}

io.on('connection', (socket) => {
    socket.on('set-user', (userId) => {
        socket.userId = userId;
        updateOnlineStatus(userId, 1);
    });

    socket.on('send-message', (data) => {
        socket.to(data.to).emit('receive-message', data);
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            updateOnlineStatus(socket.userId, 0);
        }
    });
});

server.listen(3000, () => {
    console.log('🚀 الخادم يعمل على http://localhost:3000');
    console.log('💡 تأكد من تشغيله على HTTPS عند النشر');
});