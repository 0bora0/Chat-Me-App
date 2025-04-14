require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const Message = require("./models/Message");
const MongoStore = require("connect-mongo");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const app = express();
const server = http.createServer(app);
const flash = require('express-flash');
const authRoutes = require('./routes/auth');

const mongoURI = process.env.MONGODB_URI || "mongodb+srv://120026:bora123@chat-cluster.za6ljq0.mongodb.net/?retryWrites=true&w=majority&appName=chat-cluster";
const frontendUrl = process.env.NODE_ENV === 'production' 
  ? process.env.FRONTEND_URL || 'https://chat-me-app-scak.onrender.com'
  : 'http://localhost:3000';

app.set('trust proxy', 1);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use(flash());
app.use(cors({
  origin: frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

mongoose.connect(mongoURI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true, 
  serverSelectionTimeoutMS: 50000 
})
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error:', err));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "chatnotes-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: mongoURI,
    ttl: 14 * 24 * 60 * 60 
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, 
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    domain: process.env.NODE_ENV === "production" ? '.chat-me-app-scak.onrender.com' : undefined
  },
});

app.use(sessionMiddleware);

const io = socketio(server, {
  cors: {
    origin: frontendUrl,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use('/', authRoutes);

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.redirect("/chat");
});

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/chat");
  res.render("login", { messages: req.flash() });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      req.flash('error', 'Невалиден имейл или парола');
      return res.redirect("/login");
    }

    req.session.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name
    };

    console.log('User logged in:', req.session.user);
    return res.redirect("/chat");
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Грешка при влизане');
    return res.redirect("/login");
  }
});

app.get("/register", (req, res) => {
  res.render("register", { messages: req.flash() });
});

app.post("/register", async (req, res) => {
  const { username, name, email, password } = req.body;
  
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      req.flash('error', 'Имейлът вече е използван.');
      return res.redirect("/register");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, name, email, password: hashedPassword });
    await user.save();

    req.session.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name
    };

    return res.redirect("/chat");
  } catch (err) {
    console.error('Registration error:', err);
    req.flash('error', 'Грешка при регистрация');
    return res.redirect("/register");
  }
});

app.get("/chat", requireLogin, async (req, res) => {
  try {
    const messages = await Message.find()
      .populate("user", "username")
      .sort({ timestamp: -1 })
      .limit(50);
    const allUsers = await User.find().sort({ username: 1 });

    const onlineUserIds = Array.from(connectedUsers.values()).map(u => u.id.toString());
    const usersWithStatus = allUsers.map(user => ({
      ...user.toObject(),
      online: onlineUserIds.includes(user._id.toString()),
    }));

    res.render("chat", {
      user: req.session.user,
      messages: messages.reverse(),
      allUsers: usersWithStatus,
    });
  } catch (err) {
    console.error("Грешка при зареждане на чата:", err);
    res.status(500).send("Грешка при зареждане на чата");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Session destroy error:', err);
    res.redirect("/login");
  });
});

const connectedUsers = new Map();

const wrap = (middleware) => (socket, next) =>
  middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

io.on("connection", async (socket) => {
  const user = socket.request.session.user;

  if (!user) {
    console.log("Неавтентикиран потребител - изключване");
    return socket.disconnect(true);
  }

  connectedUsers.set(socket.id, {
    id: user._id,
    username: user.username,
    socketId: socket.id,
  });

  console.log(`${user.username} се присъедини към чата`);
  updateOnlineUsers();

  const messages = await Message.find()
    .populate("user", "username")
    .sort({ timestamp: -1 })
    .limit(50);
  socket.emit("messageHistory", messages);

  socket.on("chatMessage", async (messageData) => {
    const messageText = messageData.text.trim();
    if (!messageText) return;

    const message = new Message({
      text: messageText,
      user: user._id,
      isPrivate: false,
      timestamp: new Date(),
    });

    try {
      const savedMessage = await message.save();
      io.emit("newMessage", {
        text: savedMessage.text,
        timestamp: savedMessage.timestamp.toLocaleTimeString(),
        user: {
          _id: user._id,
          username: user.username,
        },
      });
    } catch (err) {
      console.error("Грешка при запазване на съобщение:", err);
    }
  });

  socket.on("privateMessage", async (data) => {
    const messageText = data.text.trim();
    if (!messageText || !data.targetUserId) return;

    const message = new Message({
      text: messageText,
      user: user._id,
      toUser: data.targetUserId,
      isPrivate: true,
      timestamp: new Date(),
    });

    try {
      const savedMessage = await message.save();

      const targetUser = Array.from(connectedUsers.values()).find(
        (u) => u.id === data.targetUserId
      );

      if (targetUser) {
        const targetUserSocket = io.sockets.sockets.get(targetUser.socketId);
        if (targetUserSocket) {
          targetUserSocket.emit("privateMessage", {
            text: savedMessage.text,
            timestamp: savedMessage.timestamp.toLocaleTimeString(),
            from: user.username,
            fromId: user._id,
          });
        }
      }

      socket.emit("privateMessageSent", {
        text: savedMessage.text,
        timestamp: savedMessage.timestamp.toLocaleTimeString(),
        to: targetUser?.username || "Unknown",
        toId: data.targetUserId,
      });
    } catch (err) {
      console.error("Грешка при запазване на частно съобщение:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log(`${user.username} напусна чата`);
    connectedUsers.delete(socket.id);
    updateOnlineUsers();
  });

  function updateOnlineUsers() {
    const onlineUsers = Array.from(connectedUsers.values());
    io.emit("onlineUsers", onlineUsers);

    const onlineUserIds = onlineUsers.map((u) => u.id.toString());
    io.emit("userStatusUpdate", onlineUserIds);
  }
});

app.get("/api/message-history", requireLogin, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const groupMessages = await Message.find({
      $or: [
        { isPrivate: false },
        { isPrivate: true, $or: [{ user: userId }, { toUser: userId }] },
      ],
    })
      .populate("user", "username")
      .populate("toUser", "username")
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(groupMessages.reverse());
  } catch (err) {
    console.error("Грешка при зареждане на история:", err);
    res.status(500).json({ error: "Грешка при зареждане на история" });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сървърът работи на порт ${PORT}`);
});