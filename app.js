const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');
require('dotenv').config();


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
  secret: 'mysecretkey',        // change to a secure string for production
  resave: false,
  saveUninitialized: false
}));

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_Pass,
  multipleStatements: true
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed: ' + err.message);
    process.exit(1);
  }
  console.log('✅ Connected to MySQL database as id ' + db.threadId);

  // Initialize database
  initializeDatabase();
});

// Create database and tables
function initializeDatabase() {
  const setupQueries = `
    CREATE DATABASE IF NOT EXISTS abeba_db;
    USE abeba_db;

    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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
  `;
  db.query(setupQueries, (err) => {
    if (err) throw err;
    console.log('✅ Database and tables ready');
  });
}

// ---------------- ROUTES ----------------

// Home
app.get('/', (req, res) => {
  res.render('home');
});

// Signup page
app.get('/signup', (req, res) => res.render('signup'));

// Login page
app.get('/login', (req, res) => res.render('login'));

// Handle signup
app.post('/signup', (req, res) => {
  const { name, email, password } = req.body;

  db.query('USE abeba_db;', (err) => {
    if (err) return res.status(500).send('Database selection failed');

    const checkUserQuery = 'SELECT * FROM users WHERE email = ?';
    db.query(checkUserQuery, [email], (err, results) => {
      if (err) return res.status(500).send('Database error');

      if (results.length > 0) {
        return res.send('User already exists with this email');
      }

      const insertUserQuery = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
      db.query(insertUserQuery, [name, email, password], (err, results) => {
        if (err) return res.status(500).send('Error creating user');

        console.log('✅ User created with ID:', results.insertId);
        res.redirect('/login');
      });
    });
  });
});

// Handle login
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('USE abeba_db;', (err) => {
    if (err) return res.status(500).send('Database selection failed');

    const query = 'SELECT * FROM users WHERE email = ? AND password = ?';
    db.query(query, [email, password], (err, results) => {
      if (err) return res.status(500).send('Database error');

      if (results.length > 0) {
        // Store user in session
        req.session.user = results[0];
        res.redirect('/dashboard');
      } else {
        res.send('Invalid email or password');
      }
    });
  });
});

// Dashboard (requires login)
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login'); // redirect if not logged in
  res.render('dashboard', { username: req.session.user.name });
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send('Error logging out');
    res.redirect('/login');
  });
});
// Add these routes to your app.js

// Handle cycle data saving
app.post('/api/cycles', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Not logged in' });

  const { start_date, end_date, cycle_length, symptoms, mood, notes } = req.body;

  db.query('USE abeba_db;', (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Database selection failed' });

    const query = 'INSERT INTO cycles (user_id, start_date, end_date, cycle_length, symptoms, mood, notes) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(query, [req.session.user.id, start_date, end_date, cycle_length, symptoms, mood, notes], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, message: 'Error saving cycle data' });
      }

      res.json({ 
        success: true, 
        message: 'Cycle data saved successfully',
        data: { id: results.insertId }
      });
    });
  });
});
// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
