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
const isProduction = process.env.NODE_ENV === 'production';
const frontendUrl = isProduction 
  ? process.env.FRONTEND_URL || 'https://chat-me-app-scak.onrender.com'
  : 'http://localhost:3000';

// Helper function
function generateColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 60%)`;
}

// App configuration
app.locals.generateColor = generateColor;
app.set('trust proxy', 1); // Trust first proxy
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use(flash());

// CORS configuration
const corsOptions = {
  origin: frontendUrl,
  credentials: true,
  exposedHeaders: ['set-cookie'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'Set-Cookie']
};
app.use(cors(corsOptions));

// View engine setup
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// MongoDB connection
mongoose.connect(mongoURI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true, 
  serverSelectionTimeoutMS: 50000 
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.log('MongoDB connection error:', err));

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || "chatnotes-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoURI,
    ttl: 14 * 24 * 60 * 60,
    autoRemove: 'native'
  }),
  proxy: isProduction,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    domain: isProduction ? '.onrender.com' : undefined
  }
};

if (isProduction) {
  app.set('trust proxy', 1); // Trust first proxy
  sessionConfig.cookie.secure = true;
  sessionConfig.cookie.sameSite = 'none';
}

const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);

// Middleware to check login
function requireLogin(req, res, next) {
  if (!req.session.user) {
    console.log('Unauthorized access attempt - no session');
    return res.redirect("/login");
  }
  next();
}

// Routes
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.redirect("/chat");
});

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/chat");
  res.render("login", { messages: req.flash() });
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      req.flash('error', 'Invalid credentials');
      return res.status(401).redirect('/login');
    }

    req.session.regenerate(err => {
      if (err) {
        console.error('Session regenerate error:', err);
        return res.status(500).redirect('/login');
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
          return res.status(500).redirect('/login');
        }
        
        console.log('Login successful for user:', user.username);
        return res.redirect('/chat');
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Server error');
    res.status(500).redirect('/login');
  }
});

app.get("/register", (req, res) => {
  res.render("register", { messages: req.flash() });
});

app.post("/register", async (req, res) => {
  const { username, name, email, password } = req.body;
  
  try {
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      req.flash('error', 'Email or username already in use');
      return res.redirect("/register");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, name, email, password: hashedPassword });
    await user.save();

    req.session.regenerate(err => {
      if (err) {
        console.error('Session regenerate error:', err);
        return res.status(500).redirect('/register');
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
          return res.status(500).redirect('/register');
        }
        return res.redirect('/chat');
      });
    });
  } catch (err) {
    console.error('Registration error:', err);
    req.flash('error', 'Registration error');
    return res.redirect("/register");
  }
});

app.get("/chat", requireLogin, async (req, res) => {
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
    console.error("Chat load error:", err);
    res.status(500).send("Error loading chat");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Session destroy error:', err);
    res.redirect("/login");
  });
});

// Socket.io setup
const io = socketio(server, {
  cors: corsOptions
});

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(cookieParser()));

const connectedUsers = new Map();

io.on("connection", async (socket) => {
  if (!socket.request.session.user) {
    console.log('Unauthorized socket connection attempt');
    return socket.disconnect(true);
  }

  const user = socket.request.session.user;
  connectedUsers.set(socket.id, {
    id: user._id,
    username: user.username,
    socketId: socket.id
  });

  console.log(`${user.username} connected`);
  updateOnlineUsers();

  socket.on("requestMessages", async () => {
    try {
      const messages = await Message.find({ isPrivate: false })
        .populate("user", "username")
        .sort({ timestamp: 1 });
      socket.emit("messageHistory", messages);
    } catch (err) {
      console.error("Error loading messages:", err);
    }
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
      const populatedMessage = await Message.populate(savedMessage, {
        path: 'user',
        select: 'username'
      });

      io.emit("newGroupMessage", populatedMessage);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on("disconnect", () => {
    connectedUsers.delete(socket.id);
    updateOnlineUsers();
    console.log(`${user.username} disconnected`);
  });

  function updateOnlineUsers() {
    const onlineUsers = Array.from(connectedUsers.values());
    io.emit("onlineUsersUpdate", onlineUsers);
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL: ${frontendUrl}`);
  console.log(`Production mode: ${isProduction}`);
});