const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const session = require('express-session');
require('dotenv').config();
const bcrypt = require('bcrypt');
const { isLoggedIn, isDoctor, isAdmin } = require("./middleware");

const app = express();
const port = 3000;

// ==================== CONFIGURATION ====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'mysecretkey',
  resave: false,
  saveUninitialized: false
}));

// Database connection
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: process.env.DB_Pass,
  database: 'abeba_db',
  multipleStatements: true
});

// ==================== DATABASE INITIALIZATION ====================
async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...');
    
    // First, create database if it doesn't exist
    await db.query('CREATE DATABASE IF NOT EXISTS abeba_db');
    await db.query('USE abeba_db');
    console.log('✅ Database ready');

    // Create users table with ALL columns including specialization
    const createUsersTable = `
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
    `;
    await db.query(createUsersTable);
    console.log('✅ Users table ready');

    // Create chat messages table with proper indexes
    const createChatMessagesTable = `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        doctor_id INT NOT NULL,
        message TEXT NOT NULL,
        sender_type ENUM('user', 'doctor') NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_doctor (user_id, doctor_id),
        INDEX idx_doctor_user (doctor_id, user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await db.query(createChatMessagesTable);
    console.log('✅ Chat messages table ready');

    // Create other tables (unchanged)
    const createCyclesTable = `
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
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    await db.query(createCyclesTable);

    const createPostsTable = `
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
    `;
    await db.query(createPostsTable);

    const createUserSurveysTable = `
      CREATE TABLE IF NOT EXISTS user_surveys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        responses JSON NOT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    await db.query(createUserSurveysTable);

    const createPredictionsTable = `
      CREATE TABLE IF NOT EXISTS predictions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        prediction_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    await db.query(createPredictionsTable);

    const createMoodLogsTable = `
      CREATE TABLE IF NOT EXISTS mood_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        mood VARCHAR(100) NOT NULL,
        intensity INT NOT NULL,
        notes TEXT,
        log_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    await db.query(createMoodLogsTable);

    console.log('✅ All tables ready');

  } catch (err) {
    console.error('❌ Error initializing database:', err);
  }
}

// Function to verify and fix database structure
async function verifyDatabaseStructure() {
  try {
    await db.query('USE abeba_db');
    
    // Check if role column exists
    const [roleColumns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'abeba_db' 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'role'
    `);
    
    if (roleColumns.length === 0) {
      console.log('🔄 Adding missing role column to users table...');
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN role ENUM('user', 'doctor', 'admin', 'partner') NOT NULL DEFAULT 'user'
      `);
      console.log('✅ Role column added successfully');
    }

    // Check if specialization column exists
    const [specColumns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'abeba_db' 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'specialization'
    `);
    
    if (specColumns.length === 0) {
      console.log('🔄 Adding missing specialization column to users table...');
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN specialization VARCHAR(255) DEFAULT NULL
      `);
      console.log('✅ Specialization column added successfully');
    } else {
      console.log('✅ Specialization column already exists');
    }
    
    console.log('✅ Database structure verified');
  } catch (err) {
    console.error('Error verifying database structure:', err);
  }
}

// Initialize database and verify structure
initializeDatabase().then(() => {
  verifyDatabaseStructure();
});

// ==================== ROUTES ====================

// Static pages (unchanged)
app.get('/', (req, res) => res.render('home'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/login', (req, res) => res.render('login'));
app.get('/questionnaire', isLoggedIn, (req, res) => res.render('questionnaire'));
app.get('/calculators', isLoggedIn, (req, res) => res.render('calculators'));
app.get('/hcg', isLoggedIn, (req, res) => res.render('hcg'));
app.get('/implantations', isLoggedIn, (req, res) => res.render('implantations'));
app.get('/duedate', isLoggedIn, (req, res) => res.render('duedate'));
app.get('/ivf', isLoggedIn, (req, res) => res.render('ivf'));
app.get('/post', isLoggedIn, (req, res) => {
    res.render('post', { 
        userId: req.session.userId,
        username: req.session.user.name 
    });
});

// Route for premium doctor chat - fetches real doctors
app.get('/doctor-chat', isLoggedIn, async (req, res) => {
    try {
        await db.query('USE abeba_db');
        
        // Fetch all doctors from the database
        const [doctors] = await db.query(
            "SELECT id, name, email, specialization FROM users WHERE role = 'doctor'"
        );

        console.log('🩺 Doctors found:', doctors);

        res.render('doctor-chat', {
            doctors: doctors || []
        });
    } catch (err) {
        console.error('Error loading doctor chat:', err);
        res.render('doctor-chat', {
            doctors: []
        });
    }
});

// ==================== CHAT ROUTES ====================

// Send message from user to doctor - ADDED VALIDATION
app.post('/api/chat/send-message', isLoggedIn, async (req, res) => {
    try {
        const { doctor_id, message } = req.body;
        
        // Input validation
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Message cannot be empty' 
            });
        }
        
        if (!doctor_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Doctor ID is required' 
            });
        }
        
        await db.query('USE abeba_db');
        
        const [result] = await db.query(
            'INSERT INTO chat_messages (user_id, doctor_id, message, sender_type) VALUES (?, ?, ?, ?)',
            [req.session.userId, doctor_id, message.trim(), 'user']
        );

        res.json({
            success: true,
            message: 'Message sent successfully',
            data: { id: result.insertId }
        });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ success: false, message: 'Error sending message' });
    }
});

// Get chat messages for user (unchanged)
app.get('/api/chat/messages/:doctor_id', isLoggedIn, async (req, res) => {
    try {
        const { doctor_id } = req.params;
        
        await db.query('USE abeba_db');
        
        const [messages] = await db.query(`
            SELECT cm.*, 
                   u.name as user_name,
                   d.name as doctor_name
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            LEFT JOIN users d ON cm.doctor_id = d.id
            WHERE cm.user_id = ? AND cm.doctor_id = ?
            ORDER BY cm.created_at ASC
        `, [req.session.userId, doctor_id]);

        res.json({
            success: true,
            data: messages
        });
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

// Get chat messages for doctor (doctor's perspective) - FIXED QUERY
app.get('/api/doctor/chat/messages', isDoctor, async (req, res) => {
    try {
        await db.query('USE abeba_db');
        
        // Get all conversations for this doctor - FIXED QUERY
        const [conversations] = await db.query(`
            SELECT DISTINCT 
                cm.user_id, 
                u.name as user_name, 
                MAX(cm.created_at) as last_message_time,
                COUNT(CASE WHEN cm.sender_type = 'user' AND cm.is_read = FALSE THEN 1 END) as unread_count
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.doctor_id = ?
            GROUP BY cm.user_id, u.name
            ORDER BY last_message_time DESC
        `, [req.session.userId]);

        res.json({
            success: true,
            data: conversations
        });
    } catch (err) {
        console.error('Error fetching doctor conversations:', err);
        res.status(500).json({ success: false, message: 'Error fetching conversations' });
    }
});

// Get specific conversation for doctor (unchanged)
app.get('/api/doctor/chat/messages/:user_id', isDoctor, async (req, res) => {
    try {
        const { user_id } = req.params;
        
        await db.query('USE abeba_db');
        
        const [messages] = await db.query(`
            SELECT cm.*, 
                   u.name as user_name,
                   d.name as doctor_name
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            LEFT JOIN users d ON cm.doctor_id = d.id
            WHERE cm.user_id = ? AND cm.doctor_id = ?
            ORDER BY cm.created_at ASC
        `, [user_id, req.session.userId]);

        // Mark messages as read
        await db.query(
            'UPDATE chat_messages SET is_read = TRUE WHERE user_id = ? AND doctor_id = ? AND sender_type = "user" AND is_read = FALSE',
            [user_id, req.session.userId]
        );

        res.json({
            success: true,
            data: messages
        });
    } catch (err) {
        console.error('Error fetching doctor chat messages:', err);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

// Send message from doctor to user - ADDED VALIDATION
app.post('/api/doctor/chat/send-message', isDoctor, async (req, res) => {
    try {
        const { user_id, message } = req.body;
        
        // Input validation
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Message cannot be empty' 
            });
        }
        
        if (!user_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID is required' 
            });
        }
        
        await db.query('USE abeba_db');
        
        const [result] = await db.query(
            'INSERT INTO chat_messages (user_id, doctor_id, message, sender_type) VALUES (?, ?, ?, ?)',
            [user_id, req.session.userId, message.trim(), 'doctor']
        );

        res.json({
            success: true,
            message: 'Message sent successfully',
            data: { id: result.insertId }
        });
    } catch (err) {
        console.error('Error sending doctor message:', err);
        res.status(500).json({ success: false, message: 'Error sending message' });
    }
});

// Debug route to check chat messages
app.get('/api/doctor/chat/debug', isDoctor, async (req, res) => {
    try {
        await db.query('USE abeba_db');
        
        console.log('🔍 Debug - Doctor ID:', req.session.userId);
        
        // Check if there are any chat messages
        const [allMessages] = await db.query(`
            SELECT cm.*, u.name as user_name, d.name as doctor_name
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            LEFT JOIN users d ON cm.doctor_id = d.id
            WHERE cm.doctor_id = ?
            ORDER BY cm.created_at DESC
            LIMIT 10
        `, [req.session.userId]);

        // Check conversations with better query
        const [conversations] = await db.query(`
            SELECT DISTINCT 
                cm.user_id, 
                u.name as user_name, 
                MAX(cm.created_at) as last_message_time,
                COUNT(CASE WHEN cm.sender_type = 'user' AND cm.is_read = FALSE THEN 1 END) as unread_count
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.doctor_id = ?
            GROUP BY cm.user_id, u.name
            ORDER BY last_message_time DESC
        `, [req.session.userId]);

        // Check if doctor exists
        const [doctor] = await db.query('SELECT id, name, role FROM users WHERE id = ?', [req.session.userId]);

        res.json({
            success: true,
            debug: {
                doctor: doctor[0],
                doctorId: req.session.userId,
                totalMessages: allMessages.length,
                recentMessages: allMessages,
                conversations: conversations,
                conversationCount: conversations.length
            }
        });
    } catch (err) {
        console.error('Debug error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Debug error: ' + err.message,
            stack: err.stack 
        });
    }
});

// Test route to create a sample message (for testing)
app.post('/api/doctor/chat/test-message', isDoctor, async (req, res) => {
    try {
        await db.query('USE abeba_db');
        
        // Get first user to test with
        const [users] = await db.query("SELECT id FROM users WHERE role = 'user' LIMIT 1");
        
        if (users.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'No users found to test with' 
            });
        }
        
        const testUserId = users[0].id;
        
        // Create a test message
        const [result] = await db.query(
            'INSERT INTO chat_messages (user_id, doctor_id, message, sender_type) VALUES (?, ?, ?, ?)',
            [testUserId, req.session.userId, 'This is a test message from the system', 'user']
        );

        res.json({
            success: true,
            message: 'Test message created successfully',
            data: { 
                id: result.insertId,
                user_id: testUserId,
                doctor_id: req.session.userId
            }
        });
    } catch (err) {
        console.error('Test message error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error creating test message: ' + err.message 
        });
    }
});
// Get user's existing conversations
// Get user's existing conversations
app.get('/api/chat/conversations', isLoggedIn, async (req, res) => {
    try {
        await db.query('USE abeba_db');
        
        const [conversations] = await db.query(`
            SELECT DISTINCT 
                cm.doctor_id,
                d.name as doctor_name,
                d.specialization as doctor_specialty,
                MAX(cm.created_at) as last_message_time
            FROM chat_messages cm
            LEFT JOIN users d ON cm.doctor_id = d.id
            WHERE cm.user_id = ? AND d.role = 'doctor'
            GROUP BY cm.doctor_id, d.name, d.specialization
            ORDER BY last_message_time DESC
        `, [req.session.userId]);

        console.log(`📨 Found ${conversations.length} conversations for user ${req.session.userId}`);
        
        res.json({
            success: true,
            data: conversations
        });
    } catch (err) {
        console.error('Error fetching conversations:', err);
        res.status(500).json({ success: false, message: 'Error fetching conversations' });
    }
});

// Get ALL available doctors
app.get('/api/chat/available-doctors', isLoggedIn, async (req, res) => {
    try {
        await db.query('USE abeba_db');
        
        console.log('🩺 Fetching ALL doctors for user:', req.session.userId);
        
        // Get ALL doctors from the database
        const [allDoctors] = await db.query(`
            SELECT id, name, specialization
            FROM users 
            WHERE role = 'doctor'
            ORDER BY name
        `);

        console.log(`✅ Found ${allDoctors.length} doctors total`);
        console.log('Doctors:', allDoctors);
        
        res.json({
            success: true,
            data: allDoctors
        });
    } catch (err) {
        console.error('❌ Error fetching all doctors:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching doctors: ' + err.message 
        });
    }
});
// Debug route to check all doctors
app.get('/api/chat/debug-doctors', isLoggedIn, async (req, res) => {
    try {
        await db.query('USE abeba_db');
        
        console.log('🔍 Debug: Checking doctors in database...');
        
        // Check all doctors
        const [allDoctors] = await db.query(`
            SELECT id, name, email, specialization, role
            FROM users 
            WHERE role = 'doctor'
            ORDER BY name
        `);

        // Check user's existing conversations
        const [conversations] = await db.query(`
            SELECT DISTINCT doctor_id
            FROM chat_messages 
            WHERE user_id = ?
        `, [req.session.userId]);

        console.log('📊 Debug Results:');
        console.log('- Total doctors in database:', allDoctors.length);
        console.log('- Doctors found:', allDoctors);
        console.log('- User ID:', req.session.userId);
        console.log('- Existing conversations:', conversations.length);
        
        res.json({
            success: true,
            debug: {
                totalDoctors: allDoctors.length,
                doctors: allDoctors,
                userId: req.session.userId,
                existingConversations: conversations
            }
        });
    } catch (err) {
        console.error('Debug error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Debug error: ' + err.message 
        });
    }
});
// ==================== AUTHENTICATION ROUTES ====================

// Handle signup (unchanged)
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  
  try {
    await db.query('USE abeba_db');

    // Check if user already exists
    const [existingUsers] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).send('Email already registered');
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, 'user']
    );

    // Get the newly created user
    const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    
    req.session.user = newUser[0];
    req.session.userId = newUser[0].id;
    req.session.role = newUser[0].role || 'user';

    // Redirect to questionnaire page for new users
    res.redirect('/questionnaire');
    
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).send('Error creating account: ' + err.message);
  }
});

// Handle login with hardcoded admin check (unchanged)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Hardcoded admin credentials
  const ADMIN_EMAIL = 'admin@bloomcycle.com';
  const ADMIN_PASSWORD = 'Admin123!';
  
  try {
    await db.query('USE abeba_db');

    // Check if it's the hardcoded admin
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      console.log('🔑 Admin login detected');
      
      // Check if admin user exists in database, if not create it
      const [existingAdmin] = await db.query('SELECT * FROM users WHERE email = ?', [ADMIN_EMAIL]);
      
      let adminUser;
      if (existingAdmin.length === 0) {
        console.log('👤 Creating admin user in database...');
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        const [result] = await db.query(
          'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
          ['System Administrator', ADMIN_EMAIL, hashedPassword, 'admin']
        );
        const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
        adminUser = newUser[0];
        console.log('✅ Admin user created in database');
      } else {
        adminUser = existingAdmin[0];
        console.log('✅ Admin user found in database');
      }
      
      req.session.user = adminUser;
      req.session.userId = adminUser.id;
      req.session.role = 'admin';
      
      console.log('🚀 Redirecting to admin dashboard');
      return res.redirect('/admin-dashboard');
    }

    // Regular user login
    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length === 0) return res.send('Invalid email or password');

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('Invalid email or password');

    req.session.user = user;
    req.session.userId = user.id;
    req.session.role = user.role || 'user';

    // Role-based redirection
    switch (req.session.role) {
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

// Logout (unchanged)
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send('Error logging out');
    res.redirect('/login');
  });
});

// ==================== DOCTOR ROUTES ====================

// Doctor Dashboard Route with Chat (unchanged)
app.get('/doctor/dashboard', isDoctor, async (req, res) => {
  try {
    await db.query('USE abeba_db');

    // Fetch unanswered questions
    const [posts] = await db.query(`
      SELECT p.*, u.name as asked_by_name 
      FROM posts p 
      LEFT JOIN users u ON p.asked_by = u.id 
      WHERE p.answer IS NULL 
      ORDER BY p.created_at DESC
    `);

    // Get doctor info
    const [doctorResults] = await db.query(
      'SELECT name, specialization FROM users WHERE id = ?',
      [req.session.userId]
    );
    
    const doctor = doctorResults[0];

    res.render('doctor-dashboard', {
      doctorName: doctor.name || 'Doctor',
      doctorSpecialization: doctor.specialization || 'General Medicine',
      posts: posts
    });
  } catch (error) {
    console.error('Doctor dashboard error:', error);
    res.status(500).send('Error loading doctor dashboard');
  }
});

// Doctor Chat Dashboard - FIXED FILE NAME
app.get('/doctor/chat', isDoctor, async (req, res) => {
  try {
    await db.query('USE abeba_db');

    // Get doctor info
    const [doctorResults] = await db.query(
      'SELECT name, specialization FROM users WHERE id = ?',
      [req.session.userId]
    );
    
    const doctor = doctorResults[0];

    res.render('doctor-chat-dashboard', { // Fixed file name
      doctorName: doctor.name,
      doctorSpecialization: doctor.specialization || 'General Medicine'
    });
  } catch (error) {
    console.error('Doctor chat dashboard error:', error);
    res.status(500).send('Error loading doctor chat dashboard');
  }
});

// Answer Submission Route (unchanged)
app.post('/doctor/answer/:postId', isDoctor, async (req, res) => {
  try {
    const { answer } = req.body;
    const postId = req.params.postId;

    await db.query('USE abeba_db');

    // Update the post with the answer
    await db.query(
      'UPDATE posts SET answer = ?, answered_by = ?, answered_at = NOW() WHERE id = ?',
      [answer, req.session.userId, postId]
    );

    res.redirect('/doctor/dashboard');
  } catch (error) {
    console.error('Answer submission error:', error);
    res.status(500).send('Error submitting answer');
  }
});

// ==================== USER DASHBOARD ROUTES ====================

// User Dashboard (unchanged)
app.get('/user/dashboard', isLoggedIn, async (req, res) => {
  try {
    await db.query('USE abeba_db');
    const userId = req.session.userId;

    // Get user's cycles
    const [cycles] = await db.query(
      'SELECT * FROM cycles WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    // Get user's predictions
    const [predictions] = await db.query(
      'SELECT * FROM predictions WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    // Get user's mood logs
    const [moodLogs] = await db.query(
      'SELECT * FROM mood_logs WHERE user_id = ? ORDER BY log_date DESC',
      [userId]
    );

    res.render('dashboard', { 
      userId: req.session.userId,
      username: req.session.user.name,
      cycles: cycles,
      predictions: predictions,
      moodLogs: moodLogs
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// Handle questionnaire form submission to dashboard (unchanged)
app.post('/dashboard', isLoggedIn, (req, res) => {
  res.redirect('/user/dashboard');
});

// ==================== API ROUTES ====================

// All other API routes remain unchanged...
// Save survey (unchanged)
app.post('/save-survey', isLoggedIn, async (req, res) => {
  const userId = req.session.userId;
  const questionnaire = JSON.stringify(req.body);

  try {
    await db.query('USE abeba_db');
    await db.query('UPDATE users SET questionnaire = ? WHERE id = ?', [questionnaire, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving questionnaire:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Save cycle data (unchanged)
app.post('/api/cycles', isLoggedIn, async (req, res) => {
  const { start_date, end_date, cycle_length, symptoms, mood, notes } = req.body;

  try {
    await db.query('USE abeba_db');
    const [result] = await db.query(
      'INSERT INTO cycles (user_id, start_date, end_date, cycle_length, symptoms, mood, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.session.userId, start_date, end_date, cycle_length, symptoms, mood, notes]
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

// Save prediction (unchanged)
app.post('/api/predictions', isLoggedIn, async (req, res) => {
  const { prediction_data } = req.body;

  try {
    await db.query('USE abeba_db');
    const [result] = await db.query(
      'INSERT INTO predictions (user_id, prediction_data) VALUES (?, ?)',
      [req.session.userId, JSON.stringify(prediction_data)]
    );

    res.json({
      success: true,
      message: 'Prediction saved successfully'
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ success: false, message: 'Error saving prediction' });
  }
});

// Save mood log (unchanged)
app.post('/api/mood-logs', isLoggedIn, async (req, res) => {
  const { mood, intensity, notes, log_date } = req.body;

  try {
    await db.query('USE abeba_db');
    const [result] = await db.query(
      'INSERT INTO mood_logs (user_id, mood, intensity, notes, log_date) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, mood, intensity || 3, notes || `Category: mood`, log_date]
    );

    res.json({
      success: true,
      message: 'Mood logged successfully',
      data: { id: result.insertId }
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ success: false, message: 'Error saving mood log' });
  }
});

// Clear all mood logs (unchanged)
app.delete('/api/mood-logs/clear-all', isLoggedIn, async (req, res) => {
  try {
    await db.query('USE abeba_db');
    
    const [result] = await db.query(
      'DELETE FROM mood_logs WHERE user_id = ?',
      [req.session.userId]
    );

    console.log(`✅ Cleared all mood logs for user: ${req.session.userId}, deleted rows: ${result.affectedRows}`);

    res.json({ 
      success: true, 
      message: 'All mood logs cleared successfully',
      data: { deletedCount: result.affectedRows }
    });
  } catch (error) {
    console.error('Error clearing mood logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error clearing mood logs' 
    });
  }
});

// Get user's cycles (unchanged)
app.get('/api/user-cycles', isLoggedIn, async (req, res) => {
  try {
    await db.query('USE abeba_db');
    const [cycles] = await db.query(
      'SELECT * FROM cycles WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );
    res.json({ success: true, data: cycles });
  } catch (error) {
    console.error('Error fetching cycles:', error);
    res.status(500).json({ success: false, message: 'Error fetching cycles' });
  }
});

// Get user's predictions (unchanged)
app.get('/api/user-predictions', isLoggedIn, async (req, res) => {
  try {
    await db.query('USE abeba_db');
    const [predictions] = await db.query(
      'SELECT * FROM predictions WHERE user_id = ? ORDER BY created_at DESC',
      [req.session.userId]
    );
    res.json({ success: true, data: predictions });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({ success: false, message: 'Error fetching predictions' });
  }
});

// Get user's mood logs (unchanged)
app.get('/api/user-mood-logs', isLoggedIn, async (req, res) => {
  try {
    await db.query('USE abeba_db');
    const [moodLogs] = await db.query(
      'SELECT * FROM mood_logs WHERE user_id = ? ORDER BY log_date DESC',
      [req.session.userId]
    );
    res.json({ success: true, data: moodLogs });
  } catch (error) {
    console.error('Error fetching mood logs:', error);
    res.status(500).json({ success: false, message: 'Error fetching mood logs' });
  }
});

// ==================== ADMIN ROUTES ====================

// Admin dashboard (unchanged)
app.get('/admin-dashboard', isAdmin, async (req, res) => {
  try {
    await db.query('USE abeba_db');
    
    // Get doctors list
    let doctors = [];
    try {
      const [doctorResults] = await db.query(
        "SELECT id, name, email, specialization FROM users WHERE role = 'doctor'"
      );
      doctors = doctorResults;
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' && err.sqlMessage.includes('specialization')) {
        console.log('⚠️ Specialization column not found, fetching doctors without specialization...');
        // Fallback: get doctors without specialization
        const [doctorResults] = await db.query(
          "SELECT id, name, email FROM users WHERE role = 'doctor'"
        );
        doctors = doctorResults.map(doctor => ({
          ...doctor,
          specialization: 'Not specified'
        }));
      } else {
        throw err;
      }
    }

    // Get user counts
    let totalUsers = 0, totalDoctors = 0, totalAdmins = 0;
    
    try {
      const [userCount] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
      totalUsers = userCount[0]?.count || 0;
    } catch (err) {
      console.error('Error counting users:', err);
    }

    try {
      const [doctorCount] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'doctor'");
      totalDoctors = doctorCount[0]?.count || 0;
    } catch (err) {
      console.error('Error counting doctors:', err);
    }

    try {
      const [adminCount] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
      totalAdmins = adminCount[0]?.count || 0;
    } catch (err) {
      console.error('Error counting admins:', err);
    }

    // Get post statistics
    let totalPosts = 0, answeredPosts = 0, unansweredPosts = 0;
    
    try {
      const [postCount] = await db.query("SELECT COUNT(*) as count FROM posts");
      totalPosts = postCount[0]?.count || 0;
    } catch (err) {
      console.error('Error counting posts:', err);
    }

    try {
      const [answeredCount] = await db.query("SELECT COUNT(*) as count FROM posts WHERE answer IS NOT NULL");
      answeredPosts = answeredCount[0]?.count || 0;
    } catch (err) {
      console.error('Error counting answered posts:', err);
    }

    try {
      const [unansweredCount] = await db.query("SELECT COUNT(*) as count FROM posts WHERE answer IS NULL");
      unansweredPosts = unansweredCount[0]?.count || 0;
    } catch (err) {
      console.error('Error counting unanswered posts:', err);
    }

    console.log('📊 Dashboard stats:', {
      totalUsers,
      totalDoctors,
      totalAdmins,
      totalPosts,
      answeredPosts,
      unansweredPosts,
      doctorsCount: doctors.length
    });

    res.render('admin-dashboard', {
      doctors: doctors || [],
      totalUsers,
      totalDoctors,
      totalAdmins,
      totalPosts,
      answeredPosts,
      unansweredPosts
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).send('Error loading admin dashboard: ' + err.message);
  }
});

// Add doctor (unchanged)
app.post("/admin/add-doctor", isAdmin, async (req, res) => {
  try {
    const { name, email, password, specialization } = req.body;
    console.log('📝 Doctor data received:', { name, email, specialization });

    await db.query('USE abeba_db');

    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Always try to insert with specialization first
    try {
      console.log('🔄 Attempting to insert doctor with specialization:', specialization);
      const [result] = await db.query(
        'INSERT INTO users (name, email, password, role, specialization) VALUES (?, ?, ?, ?, ?)',
        [name, email, hashedPassword, 'doctor', specialization || 'General Medicine']
      );
      console.log('✅ Doctor created with specialization, ID:', result.insertId);
      return res.json({ success: true, message: "Doctor created successfully" });
    } catch (insertError) {
      if (insertError.code === 'ER_BAD_FIELD_ERROR') {
        // If specialization column doesn't exist, try without it
        console.log('⚠️ Specialization column error, inserting without specialization');
        const [result] = await db.query(
          'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
          [name, email, hashedPassword, 'doctor']
        );
        console.log('✅ Doctor created without specialization, ID:', result.insertId);
        return res.json({ success: true, message: "Doctor created successfully (without specialization)" });
      } else {
        throw insertError;
      }
    }
  } catch (err) {
    console.error('❌ Error creating doctor:', err);
    res.status(500).json({ success: false, message: "Server error. Could not create doctor." });
  }
});

// Delete doctor (unchanged)
app.post("/admin/delete-doctor/:id", isAdmin, async (req, res) => {
  try {
    const doctorId = req.params.id;

    await db.query('USE abeba_db');
    await db.query('DELETE FROM users WHERE id = ? AND role = "doctor"', [doctorId]);

    res.redirect("/admin-dashboard"); 
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error. Could not delete doctor.");
  }
});

// ==================== FIX SPECIALIZATION COLUMN ROUTE ====================
app.get('/fix-specialization-now', async (req, res) => {
  try {
    await db.query('USE abeba_db');
    
    // Force add the specialization column
    console.log('🔄 Force adding specialization column...');
    await db.query('ALTER TABLE users ADD COLUMN specialization VARCHAR(255) DEFAULT NULL');
    console.log('✅ Specialization column added successfully!');
    
    // Update existing doctors with a default specialization
    await db.query("UPDATE users SET specialization = 'General Medicine' WHERE role = 'doctor' AND specialization IS NULL");
    console.log('✅ Updated existing doctors with default specialization');
    
    res.send(`
      <h1>✅ Specialization Column Fixed!</h1>
      <p>The specialization column has been added to your database.</p>
      <p>Existing doctors have been updated with 'General Medicine' as their specialization.</p>
      <p>New doctors will now save their specialization properly.</p>
      <a href="/admin-dashboard">Go back to Admin Dashboard</a>
    `);
  } catch (err) {
    console.error('❌ Error fixing specialization:', err);
    res.send(`
      <h1>❌ Error Fixing Specialization</h1>
      <p>Error: ${err.message}</p>
      <a href="/admin-dashboard">Go back to Admin Dashboard</a>
    `);
  }
});

// ==================== ERROR HANDLING ====================
// 404 handler (unchanged)
app.use((req, res) => {
  res.status(404).render('404');
});

// Error handler (unchanged)
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).send('Something went wrong!');
});

// ==================== SERVER START ====================
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:3000`);
  console.log(`🔑 Admin login credentials:`);
  console.log(`📧 Email: admin@bloomcycle.com`);
  console.log(`🔑 Password: Admin123!`);
  console.log(`🔧 To fix specialization column, visit: http://localhost:3000/fix-specialization-now`);
  console.log(`💬 Chat system ready - users can now message doctors in real-time!`);
  console.log(`👨‍⚕️ Doctor chat dashboard: http://localhost:3000/doctor/chat`);
  console.log(`💬 User chat: http://localhost:3000/doctor-chat`);
});