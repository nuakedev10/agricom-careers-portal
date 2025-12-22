const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATABASE CONFIGURATION ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

// Test Database Connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error acquiring client', err.stack);
    }
    console.log('✅ Connected to PostgreSQL Database');
    release();
});

// --- FILE UPLOAD CONFIGURATION (MULTER) ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve uploaded files so admin can view them
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API ROUTES ---

// Submit Application Route
app.post('/api/applications', upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'coverLetter', maxCount: 1 }
]), async (req, res) => {
    try {
        const {
            fullName, email, phone, location, position, 
            education, currentRole, experience, technicalSkills, 
            domainKnowledge, portfolioLink, motivation, skills, consent
        } = req.body;

        const cvPath = req.files['cv'] ? req.files['cv'][0].path : null;
        const coverLetterPath = req.files['coverLetter'] ? req.files['coverLetter'][0].path : null;

        // SQL Query to insert application
        const query = `
            INSERT INTO applications (
                full_name, email, phone, location, position, 
                education, current_role, experience, technical_skills, 
                domain_knowledge, portfolio_link, motivation, skills, 
                cv_path, cover_letter_path, consent, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
            RETURNING id;
        `;

        const values = [
            fullName, email, phone, location, position, 
            education, currentRole, experience, technicalSkills, 
            domainKnowledge, portfolioLink, motivation, 
            Array.isArray(skills) ? skills : [skills], // Handle single or multiple skills
            cvPath, coverLetterPath, consent === 'on' || consent === 'true'
        ];

        const result = await pool.query(query, values);
        
        res.status(200).json({ 
            success: true, 
            message: 'Application submitted successfully!', 
            applicationId: result.rows[0].id 
        });
    } catch (error) {
        console.error('Submission Error:', error);
        res.status(500).json({ error: 'Database error or file upload failed.' });
    }
});

// --- PAGE NAVIGATION ROUTES ---

app.get('/apply', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/apply.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Catch-all route (Keep at the bottom)
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📄 Homepage: http://localhost:${PORT}`);
    console.log(`📝 Apply page: http://localhost:${PORT}/apply`);
    console.log(`🔧 Admin dashboard: http://localhost:${PORT}/admin`);
});