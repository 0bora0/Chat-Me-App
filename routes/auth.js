const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/register', (req, res) => {
  res.render('register');
});

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const user = new User({ name, email, password });
    await user.save();
    req.session.userId = user._id;
    res.redirect('/dashboard');
  } catch (err) {
    res.send('Грешка при регистрация: ' + err.message);
  }
});

router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.send('Грешен имейл или парола');

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.send('Грешен имейл или парола');

    req.session.userId = user._id;
    res.redirect('/dashboard');
  } catch (err) {
    res.send('Грешка при вход: ' + err.message);
  }
});
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
