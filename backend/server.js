const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Look for .env in parent folder

const app = express();
const PORT = process.env.PORT || 3000;

// Debug: Check environment variables
console.log('🔧 Environment Check for Render:');
console.log('PORT:', PORT);
console.log('DB_HOST exists:', !!process.env.DB_HOST);
console.log('DB_USER exists:', !!process.env.DB_USER);
console.log('DB_NAME exists:', !!process.env.DB_NAME);

// --- DATABASE CONFIGURATION FOR RENDER ---
const pool = new Pool({
    user: process.env.DB_USER || 'agricom_admin',
    host: process.env.DB_HOST || 'dpg-d54gm3ngi27c73ea1b80-a.oregon-postgres.render.com',
    database: process.env.DB_NAME || 'agricom_applications',
    password: process.env.DB_PASSWORD || 'BMrYHlxdqIzhPk01cG8ANm6Vggsyy7bq',
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false } // Render PostgreSQL requires SSL
});

// Test Database Connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL Database on Render');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL pool error:', err);
});

// --- CREATE TABLE FUNCTION ---
const createTable = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS applications (
            id SERIAL PRIMARY KEY,
            full_name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            location VARCHAR(100) NOT NULL,
            alx_status VARCHAR(50) DEFAULT 'Not specified',
            position VARCHAR(50) NOT NULL,
            education TEXT NOT NULL,
            current_role_text TEXT,
            experience VARCHAR(20) NOT NULL,
            technical_skills TEXT NOT NULL,
            domain_knowledge TEXT,
            portfolio_link TEXT,
            motivation TEXT NOT NULL,
            skills TEXT[],
            cv_filename VARCHAR(255),
            cover_letter_filename VARCHAR(255),
            consent BOOLEAN NOT NULL,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(20) DEFAULT 'pending',
            notes TEXT
        )`;
    
    try {
        await pool.query(createTableQuery);
        console.log('✅ Applications table ready');
    } catch (error) {
        console.error('❌ Error creating table:', error.message);
    }
};

// Initialize table on server start
createTable();

// --- FILE UPLOAD CONFIGURATION ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files - IMPORTANT: Adjust paths for Render
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(uploadDir));

// --- HEALTH CHECK ENDPOINTS ---
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Agricom Careers Backend'
    });
});

app.get('/api/db-check', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as db_time');
        res.json({
            status: 'OK',
            database: 'Connected',
            db_time: result.rows[0].db_time
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            database: 'Disconnected',
            error: error.message
        });
    }
});

// --- APPLICATION ROUTES ---

// Submit Application
app.post('/api/applications', upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'coverLetter', maxCount: 1 }
]), async (req, res) => {
    console.log('📥 Received application submission');
    
    try {
        const {
            fullName, email, phone, location, alxStatus, position, 
            education, currentRole, experience, technicalSkills, 
            domainKnowledge, portfolioLink, motivation, consent
        } = req.body;

        // Handle skills
        let skills = req.body.skills;
        let skillsArray = [];
        
        if (skills) {
            if (Array.isArray(skills)) {
                skillsArray = skills;
            } else if (typeof skills === 'string') {
                skillsArray = [skills];
            }
        }

        const cvFilename = req.files && req.files['cv'] ? req.files['cv'][0].filename : null;
        const coverLetterFilename = req.files && req.files['coverLetter'] ? req.files['coverLetter'][0].filename : null;

        const query = `
            INSERT INTO applications (
                full_name, email, phone, location, alx_status, position, 
                education, current_role_text, experience, technical_skills, 
                domain_knowledge, portfolio_link, motivation, skills, 
                cv_filename, cover_letter_filename, consent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING id;
        `;

        const values = [
            fullName || '', 
            email || '', 
            phone || '', 
            location || '', 
            alxStatus || 'Not specified',
            position || '', 
            education || '', 
            currentRole || '', 
            experience || '', 
            technicalSkills || '', 
            domainKnowledge || '', 
            portfolioLink || '', 
            motivation || '', 
            skillsArray,
            cvFilename, 
            coverLetterFilename, 
            consent === 'on' || consent === 'true' || consent === true || false
        ];

        const result = await pool.query(query, values);
        
        res.status(200).json({ 
            success: true, 
            message: 'Application submitted successfully!', 
            applicationId: result.rows[0].id 
        });
        
    } catch (error) {
        console.error('❌ Submission Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Application submission failed.',
            details: error.message 
        });
    }
});

// Get all applications (admin)
app.get('/api/applications', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM applications ORDER BY submitted_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update application status
app.put('/api/applications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        
        const query = `
            UPDATE applications 
            SET status = $1, notes = $2 
            WHERE id = $3 
            RETURNING *
        `;
        
        const result = await pool.query(query, [status, notes, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        res.json({ success: true, application: result.rows[0] });
    } catch (error) {
        console.error('Error updating application:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- PAGE ROUTES ---
app.get('/apply', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/apply.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Catch-all for frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 URL: https://agricom-careers-portal.onrender.com`);
    console.log(`📝 Apply: https://agricom-careers-portal.onrender.com/apply`);
    console.log(`🔧 Admin: https://agricom-careers-portal.onrender.com/admin`);
    console.log(`🏥 Health: https://agricom-careers-portal.onrender.com/api/health`);
});