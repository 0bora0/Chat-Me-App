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

const mongoURI = process.env.MONGODB_URI || "mongodb+srv://120026:bora123@chat-cluster.za6ljq0.mongodb.net/?retryWrites=true&w=majority&appName=chat-cluster";
const frontendUrl = process.env.NODE_ENV === 'production' 
  ? process.env.FRONTEND_URL || 'https://chat-me-app-scak.onrender.com'
  : 'http://localhost:3000';
function generateColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 60%)`;
}

app.locals.generateColor = generateColor;
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['set-cookie']
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
      domain: process.env.NODE_ENV === "production" ? "chat-me-app-scak.onrender.com" : undefined
    }
  });

app.use(sessionMiddleware);

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

    req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect("/login");
      }
      console.log('User logged in:', req.session.user);
      return res.redirect("/chat");
    });
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

app.get("/chat", async (req, res) => {
  console.log('Session in /chat:', req.session); // Добавете за дебъг
  if (!req.session.user) {
    console.log('No user session, redirecting');
    return res.redirect("/login");
  }
  
  try {
    const [messages, allUsers] = await Promise.all([
      Message.find({ isPrivate: false })
        .populate("user", "username")
        .sort({ timestamp: -1 })
        .limit(50),
      User.find({ _id: { $ne: req.session.user._id } }).sort({ username: 1 })
    ]);

    res.render("chat", {
      user: req.session.user,
      messages: messages.reverse(),
      allUsers
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

const io = socketio(server, {
  cors: {
    origin: frontendUrl,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const connectedUsers = new Map();

const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

io.on("connection", async (socket) => {
  const user = socket.request.session.user;
  if (!user) return socket.disconnect(true);

  connectedUsers.set(socket.id, {
    id: user._id,
    username: user.username,
    socketId: socket.id
  });

  console.log(`${user.username} се присъедини към чата`);
  updateOnlineUsers();

  socket.on("requestMessages", async () => {
    try {
      const messages = await Message.find({ isPrivate: false })
        .populate("user", "username")
        .sort({ timestamp: 1 });
      socket.emit("messageHistory", messages);
    } catch (err) {
      console.error("Грешка при зареждане на историята:", err);
    }
  });

  socket.on("requestOnlineUsers", () => {
    const onlineUsers = Array.from(connectedUsers.values());
    socket.emit("onlineUsersUpdate", onlineUsers);
  });

  socket.on("groupMessage", async (messageText) => {
    if (!messageText.trim()) return;

    try {
      const message = new Message({
        text: messageText,
        user: user._id,
        isPrivate: false,
        timestamp: new Date()
      });

      const savedMessage = await message.save();
      const populatedMessage = await Message.populate(savedMessage, [
        { path: 'user', select: 'username' }
      ]);

      io.emit("newGroupMessage", populatedMessage);
    } catch (err) {
      console.error("Грешка при запазване на групово съобщение:", err);
    }
  });

  socket.on("disconnect", () => {
    connectedUsers.delete(socket.id);
    updateOnlineUsers();
    console.log(`${user.username} напусна чата`);
  });

  function updateOnlineUsers() {
    const onlineUsers = Array.from(connectedUsers.values());
    io.emit("onlineUsersUpdate", onlineUsers);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сървърът работи на порт ${PORT}`);
});