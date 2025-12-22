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
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Test Database Connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error acquiring client', err.stack);
    }
    console.log('✅ Connected to PostgreSQL Database');
    release();
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
    
    const createIndexes = `
        CREATE INDEX IF NOT EXISTS idx_email ON applications(email);
        CREATE INDEX IF NOT EXISTS idx_position ON applications(position);
        CREATE INDEX IF NOT EXISTS idx_status ON applications(status);
    `;
    
    try {
        await pool.query(createTableQuery);
        console.log('✅ Applications table created or already exists');
        
        await pool.query(createIndexes);
        console.log('✅ Indexes created or already exist');
        
    } catch (error) {
        console.error('❌ Error creating table:', error.message);
    }
};

// Initialize table on server start
createTable();

// --- FILE UPLOAD CONFIGURATION (MULTER) ---
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
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve uploaded files so admin can view them
app.use('/uploads', express.static(uploadDir));

// --- API ROUTES ---

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: 'Connected'
    });
});

// Submit Application Route
app.post('/api/applications', upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'coverLetter', maxCount: 1 }
]), async (req, res) => {
    console.log('📥 Received application submission');
    
    try {
        // Log all form data for debugging
        console.log('📋 Form data:', req.body);
        console.log('📁 Files:', req.files);
        
        const {
            fullName, email, phone, location, alxStatus, position, 
            education, currentRole, experience, technicalSkills, 
            domainKnowledge, portfolioLink, motivation, consent
        } = req.body;

        // Handle skills - can be string or array
        let skills = req.body.skills;
        let skillsArray = [];
        
        if (skills) {
            if (Array.isArray(skills)) {
                skillsArray = skills;
            } else if (typeof skills === 'string') {
                skillsArray = skills.split(',').map(s => s.trim());
            }
        }
        
        console.log('🎯 Skills array:', skillsArray);

        const cvFilename = req.files && req.files['cv'] ? req.files['cv'][0].filename : null;
        const coverLetterFilename = req.files && req.files['coverLetter'] ? req.files['coverLetter'][0].filename : null;

        console.log('📄 CV filename:', cvFilename);
        console.log('📄 Cover letter filename:', coverLetterFilename);

        // SQL Query to insert application
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

        console.log('💾 Inserting into database with values:', values);

        const result = await pool.query(query, values);
        
        console.log('✅ Application saved with ID:', result.rows[0].id);
        
        res.status(200).json({ 
            success: true, 
            message: 'Application submitted successfully!', 
            applicationId: result.rows[0].id 
        });
        
    } catch (error) {
        console.error('❌ Submission Error:', error.message);
        console.error('❌ Full error:', error);
        
        res.status(500).json({ 
            success: false, 
            error: 'Application submission failed.',
            details: error.message 
        });
    }
});

// Get all applications (for admin)
app.get('/api/applications', async (req, res) => {
    try {
        console.log('📋 Fetching all applications');
        const result = await pool.query('SELECT * FROM applications ORDER BY submitted_at DESC');
        console.log(`✅ Found ${result.rows.length} applications`);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error fetching applications:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update application status (for admin)
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Something went wrong!',
        details: err.message 
    });
});

// --- START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📄 Homepage: http://localhost:${PORT}`);
    console.log(`📝 Apply page: http://localhost:${PORT}/apply`);
    console.log(`🔧 Admin dashboard: http://localhost:${PORT}/admin`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});