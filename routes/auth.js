const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');

router.get('/register', (req, res) => {
  res.render('register', { 
    messages: req.flash(),
    title: 'Регистрация' 
  });
});

router.post('/register', async (req, res) => {
  try {
    const { username, name, email, password } = req.body;
    
    if (!username || !name || !email || !password) {
      req.flash('error', 'Моля, попълнете всички полета');
      return res.redirect('/register');
    }
    
    if (password.length < 6) {
      req.flash('error', 'Паролата трябва да бъде поне 6 символа');
      return res.redirect('/register');
    }
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      req.flash('error', 'Имейлът или потребителското име вече са заети');
      return res.redirect('/register');
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      username,
      name,
      email,
      password: hashedPassword
    });
    
    await user.save();
    
    req.session.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name
    };
    
    res.redirect('/chat');
  } catch (err) {
    console.error('Грешка при регистрация:', err);
    req.flash('error', 'Възникна грешка при регистрацията');
    res.redirect('/register');
  }
});

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/chat');
  }
  res.render('login', { 
    messages: req.flash(),
    title: 'Вход' 
  });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error', 'Грешен имейл или парола');
      return res.redirect('/login');
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash('error', 'Грешен имейл или парола');
      return res.redirect('/login');
    }
    
    req.session.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name
    };
    
    if (remember) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; 
    }
    
    res.redirect('/chat');
  } catch (err) {
    console.error('Грешка при вход:', err);
    req.flash('error', 'Възникна грешка при входа');
    res.redirect('/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Грешка при изход:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;