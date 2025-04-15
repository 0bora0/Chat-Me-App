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
const flash = require("express-flash");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// === CONFIGURATION ===
const mongoURI = process.env.MONGODB_URI || "mongodb+srv://120026:bora123@chat-cluster.za6ljq0.mongodb.net/?retryWrites=true&w=majority&appName=chat-cluster";
const isProduction = process.env.NODE_ENV === 'production';
const frontendUrl = isProduction 
  ? process.env.FRONTEND_URL || 'https://chat-me-app-scak.onrender.com'
  : 'http://localhost:3000';

// === APP MIDDLEWARES ===
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(flash());

app.locals.generateColor = function(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 60%)`;
};

const corsOptions = {
  origin: frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// === MONGOOSE ===
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB error:", err));

// === SESSION ===
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "chatnotes-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoURI
  }),
  proxy: isProduction,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    domain: isProduction ? ".onrender.com" : undefined
  }
});
app.use(sessionMiddleware);

// === SOCKET.IO MIDDLEWARE ===
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(cookieParser()));

const connectedUsers = new Map();

io.on("connection", async (socket) => {
  const session = socket.request.session;
  const user = session?.user;

  if (!user) return socket.disconnect(true);

  connectedUsers.set(socket.id, {
    id: user._id,
    username: user.username,
    socketId: socket.id
  });

  console.log(`${user.username} connected`);
  updateOnlineUsers();

  socket.on("requestMessages", async () => {
    const messages = await Message.find({ isPrivate: false })
      .populate("user", "username")
      .sort({ timestamp: 1 });
    socket.emit("messageHistory", messages);
  });

  socket.on("groupMessage", async (text) => {
    if (!text.trim()) return;

    const message = new Message({
      text,
      user: user._id,
      isPrivate: false,
      timestamp: new Date()
    });

    const saved = await message.save();
    const populated = await Message.populate(saved, {
      path: 'user',
      select: 'username'
    });

    // Broadcast to all including sender
    io.emit("newGroupMessage", populated);
  });

  socket.on("disconnect", () => {
    connectedUsers.delete(socket.id);
    updateOnlineUsers();
    console.log(`${user.username} disconnected`);
  });

  function updateOnlineUsers() {
    const users = Array.from(connectedUsers.values());
    io.emit("onlineUsersUpdate", users);
  }
});

// === LOGIN PROTECTION ===
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// === ROUTES ===
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
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    req.flash("error", "Invalid credentials");
    return res.redirect("/login");
  }

  req.session.regenerate(err => {
    if (err) return res.redirect("/login");
    req.session.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name
    };
    req.session.save(err => {
      if (err) return res.redirect("/login");
      res.redirect("/chat");
    });
  });
});

app.get("/register", (req, res) => {
  res.render("register", { messages: req.flash() });
});

app.post("/register", async (req, res) => {
  const { username, name, email, password } = req.body;
  const exists = await User.findOne({ $or: [{ email }, { username }] });
  if (exists) {
    req.flash("error", "Email or username in use");
    return res.redirect("/register");
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ username, name, email, password: hashed });
  await user.save();

  req.session.regenerate(err => {
    if (err) return res.redirect("/register");
    req.session.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name
    };
    req.session.save(() => res.redirect("/chat"));
  });
});

app.get("/chat", requireLogin, async (req, res) => {
  const [messages, users] = await Promise.all([
    Message.find({ isPrivate: false }).populate("user", "username").sort({ timestamp: -1 }).limit(50),
    User.find({ _id: { $ne: req.session.user._id } }).sort({ username: 1 })
  ]);

  res.render("chat", {
    user: req.session.user,
    messages: messages.reverse(),
    allUsers: users
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// === START SERVER ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Frontend URL: ${frontendUrl}`);
});
