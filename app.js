const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const session = require('express-session');
require('dotenv').config();
const bcrypt = require('bcrypt');
const { isLoggedIn, isDoctor, isAdmin } = require("./middleware");

const app = express();
const port = 3000;

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Setup sessions
app.use(session({
  secret: 'mysecretkey',
  resave: false,
  saveUninitialized: false
}));

// MySQL promise pool
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_Pass,
  multipleStatements: true
});

// Initialize database
async function initializeDatabase() {
  try {
    const setupQueries = `
CREATE DATABASE IF NOT EXISTS abeba_db;
USE abeba_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('user', 'doctor', 'admin', 'partner') NOT NULL DEFAULT 'user',
  specialization VARCHAR(255) DEFAULT NULL,
  questionnaire JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  start_date DATE NOT NULL,
  end_date DATE,
  cycle_length INT,
  symptoms TEXT,
  mood VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  asked_by INT NOT NULL,
  answer TEXT DEFAULT NULL,
  answered_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  answered_at TIMESTAMP NULL DEFAULT NULL,
  likes INT DEFAULT 0,
  FOREIGN KEY (asked_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (answered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  responses JSON NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;
    await db.query(setupQueries);
    console.log('✅ Database and tables ready');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  }
}

// Run initialization
initializeDatabase();

// ---------------- ROUTES ----------------

// Home
app.get('/', (req, res) => res.render('home'));

// Signup page
app.get('/signup', (req, res) => res.render('signup'));

// Login page
app.get('/login', (req, res) => res.render('login'));

// Questionnaire
app.get('/questionnaire', isLoggedIn, (req, res) => res.render('questionnaire'));

// Handle signup
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    await db.query('USE abeba_db');

    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.send('User already exists with this email');

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    req.session.userId = result.insertId;
    req.session.user = { id: result.insertId, name, role: 'user' };

    res.redirect('/questionnaire');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating user');
  }
});

// Handle login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    await db.query('USE abeba_db');

    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length === 0) return res.send('Invalid email or password');

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('Invalid email or password');

    req.session.user = user;
    req.session.userId = user.id;
    req.session.role = user.role;

    // Role-based redirection
    switch (user.role) {
      case 'admin':
        return res.redirect('/admin-dashboard');
      case 'doctor':
        return res.redirect('/doctor/dashboard');
      case 'partner':
        return res.redirect('/partner/dashboard');
      default:
        return res.redirect('/user/dashboard');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send('Error logging out');
    res.redirect('/login');
  });
});

// Dashboard
app.get('/dashboard', isLoggedIn, (req, res) => {
  res.render('dashboard', { username: req.session.user.name });
});

// Save survey
app.post('/save-survey', isLoggedIn, async (req, res) => {
  const userId = req.session.userId;
  const questionnaire = JSON.stringify(req.body);

  try {
    await db.query('UPDATE users SET questionnaire = ? WHERE id = ?', [questionnaire, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving questionnaire:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Admin dashboard
app.get('/admin-dashboard', isAdmin, async (req, res) => {
  try {
    const [doctors] = await db.query(
      "SELECT id AS _id, name, email, specialization FROM users WHERE role = 'doctor'"
    );

    const [[{ totalUsers }]] = await db.query(
      "SELECT COUNT(*) AS totalUsers FROM users WHERE role = 'user'"
    );
    const [[{ totalDoctors }]] = await db.query(
      "SELECT COUNT(*) AS totalDoctors FROM users WHERE role = 'doctor'"
    );
    const [[{ totalAdmins }]] = await db.query(
      "SELECT COUNT(*) AS totalAdmins FROM users WHERE role = 'admin'"
    );

    const [[{ totalPosts }]] = await db.query(
      "SELECT COUNT(*) AS totalPosts FROM posts"
    );
    const [[{ answeredPosts }]] = await db.query(
      "SELECT COUNT(*) AS answeredPosts FROM posts WHERE answer IS NOT NULL"
    );
    const [[{ unansweredPosts }]] = await db.query(
      "SELECT COUNT(*) AS unansweredPosts FROM posts WHERE answer IS NULL"
    );

    res.render('admin-dashboard', {
      doctors,
      totalUsers,
      totalDoctors,
      totalAdmins,
      totalPosts,
      answeredPosts,
      unansweredPosts
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading dashboard');
  }
});
app.post("/admin/add-doctor", isAdmin, async (req, res) => {
  try {
    const { name, email, password, specialization } = req.body;

    // Ensure database is selected
    await db.query('USE abeba_db');

    // Check if the email already exists
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).send("Email already exists.");
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new doctor into the database
    await db.query(
      'INSERT INTO users (name, email, password, role, specialization) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'doctor', specialization]
    );

    // Redirect back to admin dashboard
    res.redirect("/admin-dashboard"); 

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error. Could not create doctor.");
  }
});
app.post("/admin/delete-doctor/:id", isAdmin, async (req, res) => {
  try {
    const doctorId = req.params.id;

    // Ensure database is selected
    await db.query('USE abeba_db');

    // Delete the doctor by id
    await db.query('DELETE FROM users WHERE id = ? AND role = "doctor"', [doctorId]);

    res.redirect("/admin-dashboard"); 
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error. Could not delete doctor.");
  }
});

// Save cycle data
app.post('/api/cycles', isLoggedIn, async (req, res) => {
  const { start_date, end_date, cycle_length, symptoms, mood, notes } = req.body;

  try {
    const [result] = await db.query(
      'INSERT INTO cycles (user_id, start_date, end_date, cycle_length, symptoms, mood, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.session.user.id, start_date, end_date, cycle_length, symptoms, mood, notes]
    );

    res.json({
      success: true,
      message: 'Cycle data saved successfully',
      data: { id: result.insertId }
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ success: false, message: 'Error saving cycle data' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
