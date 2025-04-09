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
const cookieParser = require("cookie-parser");
const app = express();
const server = http.createServer(app);

const io = socketio(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const mongoURI =
  "mongodb+srv://120026:bora123@chat-cluster.za6ljq0.mongodb.net/?retryWrites=true&w=majority&appName=chat-cluster";

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

mongoose
  .connect(mongoURI)
  .then(() => console.log("Свързано с MongoDB"))
  .catch((err) => console.error("Грешка при свързване с MongoDB:", err));

const sessionMiddleware = session({
  secret: "chatnotes-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: mongoURI }),
  cookie: {
    maxAge: 1000 * 60 * 60,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
});

app.use(sessionMiddleware);

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).send("Невалиден имейл или парола");
  }

  req.session.user = {
    _id: user._id,
    username: user.username,
    email: user.email,
  };

  res.redirect("/chat");
});

app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", async (req, res) => {
  const { username, name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) return res.status(400).send("Имейлът вече е използван.");

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({
    username,
    name,
    email,
    password: hashedPassword,
  });

  await user.save();
  req.session.user = {
    _id: user._id,
    username: user.username,
    email: user.email,
  };

  res.redirect("/chat");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.redirect("/chat");
});

app.get("/chat", requireLogin, async (req, res) => {
  try {
    const messages = await Message.find()
      .populate("user", "username")
      .sort({ timestamp: -1 })
      .limit(50);
    const allUsers = await User.find().sort({ username: 1 });

    const onlineUserIds = Array.from(connectedUsers.values()).map((u) =>
      u.id.toString()
    );
    const usersWithStatus = allUsers.map((user) => ({
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
      timestamp: new Date(),
      user: user._id
    });
  
    try {
      const savedMessage = await message.save();
      console.log("💾 Съобщение записано:", savedMessage); 
      io.emit("newMessage", {
        text: savedMessage.text,
        timestamp: savedMessage.timestamp.toLocaleTimeString(),
        user: {
          _id: user._id,
          username: user.username
        }
      });
    } catch (err) {
      console.error("Грешка при запазване на съобщение:", err);
    }
  });
  

  socket.on("privateMessage", (data) => {
    const messageText = data.text.trim();
    if (!messageText || !data.targetUserId) return;

    const targetUser = Array.from(connectedUsers.values()).find(
      (u) => u.id === data.targetUserId
    );

    if (targetUser) {
      const targetUserSocket = io.sockets.sockets.get(targetUser.socketId);
      if (targetUserSocket) {
        const timestamp = new Date();

        targetUserSocket.emit("privateMessage", {
          text: messageText,
          timestamp: timestamp.toLocaleTimeString(),
          from: user.username,
          fromId: user._id,
        });

        socket.emit("privateMessageSent", {
          text: messageText,
          timestamp: timestamp.toLocaleTimeString(),
          to: targetUser.username,
          toId: targetUser.id,
        });
      }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сървърът работи на порт ${PORT}`);
});
