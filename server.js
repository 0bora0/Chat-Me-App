require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const Message = require("./models/Message");
const MongoStore = require("connect-mongo");
const cors = require("cors");
const cookieParser = require('cookie-parser');
const app = express();
const server = http.createServer(app);

const io = socketio(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const mongoURI = "mongodb+srv://120026:bora123@chat-cluster.za6ljq0.mongodb.net/?retryWrites=true&w=majority&appName=chat-cluster";

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Настройка на Pug като шаблонен двигател
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

mongoose.connect(mongoURI)
  .then(() => console.log("Свързано с MongoDB"))
  .catch(err => console.error("Грешка при свързване с MongoDB:", err));

const sessionMiddleware = session({
  secret: "chatnotes-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: mongoURI }),
  cookie: { 
    maxAge: 1000 * 60 * 60,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
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

app.get("/chat", requireLogin, async (req, res) => {
  const messages = await Message.find().populate("user", "username").sort({ timestamp: 1 }).limit(50);
  res.render("chat", { user: req.session.user, messages });
});

app.get("/login", (req, res) => res.render("login"));
app.get("/register", (req, res) => res.render("register"));

app.post("/register", async (req, res) => {
  try {
    const { username, name, email, password } = req.body;

    if (!username || !name || !email || !password) {
      return res.status(400).json({ error: "Моля, попълнете всички полета!" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(409).json({ error: "Потребител с този имейл или потребителско име вече съществува!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, name, email, password: hashedPassword });
    await user.save();
    
    res.status(201).json({ message: "Успешна регистрация!" });
  } catch (err) {
    console.error("Грешка при регистрация:", err);
    res.status(500).json({ error: "Сървърна грешка" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Моля, попълнете всички полета!" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Грешен имейл или парола!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Грешен имейл или парола!" });
    }

    req.session.user = {
      _id: user._id,
      username: user.username,
      email: user.email
    };

    res.json({ message: "Успешен вход!", user: req.session.user });
  } catch (err) {
    console.error("Грешка при вход:", err);
    res.status(500).json({ error: "Сървърна грешка" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Грешка при унищожаване на сесията:", err);
      return res.status(500).send("Грешка при изход");
    }
    res.redirect("/login");
  });
});

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

io.on("connection", async (socket) => {
  if (!socket.request.session.user) {
    console.log("Неавтентикиран потребител - изключване");
    return socket.disconnect(true);
  }

  const user = socket.request.session.user;
  console.log(`${user.username} се присъедини към чата`);

  const messages = await Message.find().populate("user", "username").sort({ timestamp: -1 }).limit(50);
  socket.emit("message history", messages.reverse());

  socket.on('chatMessage', (messageData) => {
    const messageText = messageData.text;  
    const message = new Message({
      text: messageText,
      timestamp: messageData.timestamp, 
    });

    message.save((err) => {
      if (err) {
        console.warn('Error saving message:', err);
      } else {
        console.log('Message saved');
      }
    });
  });

  socket.on("disconnect", () => {
    console.log(`${user.username} напусна чата`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сървърът работи на порт ${PORT}`);
});
