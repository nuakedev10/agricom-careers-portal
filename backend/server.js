const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');

// For Render, we need to explicitly load dotenv
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Debug: Check all environment variables
console.log('🔧 Environment Variables:');
console.log('PORT:', process.env.PORT);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('NODE_ENV:', process.env.NODE_ENV);

// --- DATABASE CONFIGURATION ---
// Use hardcoded values for Render since env vars aren't loading
const pool = new Pool({
    user: process.env.DB_USER || 'agricom_admin',
    host: process.env.DB_HOST || 'dpg-d54gm3ngi27c73ea1b80-a.oregon-postgres.render.com',
    database: process.env.DB_NAME || 'agricom_applications',
    password: process.env.DB_PASSWORD || 'BMrYHlxdqIzhPk01cG8ANm6Vggsyy7bq',
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

console.log('🔌 Database Configuration:');
console.log('Host:', pool.options.host);
console.log('Database:', pool.options.database);

// --- ROBUST TABLE CREATION ---
const createOrUpdateTable = async () => {
    try {
        // First, check if table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'applications'
            );
        `);

        if (!tableCheck.rows[0].exists) {
            // Create table if it doesn't exist
            await pool.query(`
                CREATE TABLE applications (
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
                );
            `);
            console.log('✅ Created applications table');
        } else {
            console.log('✅ Applications table exists');
            
            // Check and add missing columns
            const columns = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'applications' 
                AND table_schema = 'public'
            `);
            
            const existingColumns = columns.rows.map(row => row.column_name);
            console.log('📊 Existing columns:', existingColumns);
            
            // Add missing columns
            const requiredColumns = [
                { name: 'alx_status', type: 'VARCHAR(50)', default: "'Not specified'" },
                { name: 'current_role_text', type: 'TEXT' },
                { name: 'domain_knowledge', type: 'TEXT' },
                { name: 'portfolio_link', type: 'TEXT' },
                { name: 'skills', type: 'TEXT[]' },
                { name: 'cv_filename', type: 'VARCHAR(255)' },
                { name: 'cover_letter_filename', type: 'VARCHAR(255)' },
                { name: 'notes', type: 'TEXT' }
            ];
            
            for (const column of requiredColumns) {
                if (!existingColumns.includes(column.name)) {
                    try {
                        await pool.query(`
                            ALTER TABLE applications 
                            ADD COLUMN ${column.name} ${column.type} ${column.default ? `DEFAULT ${column.default}` : ''}
                        `);
                        console.log(`✅ Added missing column: ${column.name}`);
                    } catch (err) {
                        console.log(`⚠️ Could not add column ${column.name}:`, err.message);
                    }
                }
            }
        }
        
        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_email ON applications(email);
            CREATE INDEX IF NOT EXISTS idx_position ON applications(position);
            CREATE INDEX IF NOT EXISTS idx_status ON applications(status);
        `);
        
        console.log('✅ Database setup complete');
        
    } catch (error) {
        console.error('❌ Database setup error:', error.message);
    }
};

// Initialize database
createOrUpdateTable();

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

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(uploadDir));

// --- HEALTH CHECK ENDPOINTS ---
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Agricom Careers Backend',
        port: PORT
    });
});

app.get('/api/db-check', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as db_time');
        res.json({
            status: 'OK',
            database: 'Connected',
            db_time: result.rows[0].db_time,
            table: 'applications'
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            database: 'Disconnected',
            error: error.message
        });
    }
});

// --- FIX DATABASE COLUMNS ENDPOINT ---
app.get('/api/fix-db', async (req, res) => {
    try {
        await createOrUpdateTable();
        res.json({ success: true, message: 'Database fixed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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

        console.log('📋 Form data received:', { fullName, email, position });

        // Handle skills
        let skills = req.body.skills;
        let skillsArray = [];
        
        if (skills) {
            if (Array.isArray(skills)) {
                skillsArray = skills;
            } else if (typeof skills === 'string') {
                // Handle comma-separated skills or single skill
                skillsArray = skills.includes(',') 
                    ? skills.split(',').map(s => s.trim()).filter(s => s)
                    : [skills];
            }
        }

        const cvFilename = req.files && req.files['cv'] ? req.files['cv'][0].filename : null;
        const coverLetterFilename = req.files && req.files['coverLetter'] ? req.files['coverLetter'][0].filename : null;

        console.log('📄 Files:', { cvFilename, coverLetterFilename });

        // Dynamic query that handles missing columns gracefully
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

        console.log('💾 Executing query with values:', values);

        const result = await pool.query(query, values);
        
        console.log('✅ Application saved with ID:', result.rows[0].id);
        
        res.status(200).json({ 
            success: true, 
            message: 'Application submitted successfully!', 
            applicationId: result.rows[0].id 
        });
        
    } catch (error) {
        console.error('❌ Submission Error Details:', {
            message: error.message,
            query: error.query,
            parameters: error.parameters
        });
        
        // If it's a column error, try to fix the table and retry
        if (error.message.includes('column') && error.message.includes('does not exist')) {
            console.log('🔄 Attempting to fix database schema...');
            try {
                await createOrUpdateTable();
                // Retry logic could be added here if needed
            } catch (fixError) {
                console.error('❌ Failed to fix schema:', fixError.message);
            }
        }
        
        res.status(500).json({ 
            success: false, 
            error: 'Application submission failed.',
            details: error.message,
            suggestion: 'Visit /api/fix-db to repair database schema'
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
    console.log(`🔧 DB Fix: https://agricom-careers-portal.onrender.com/api/fix-db`);
});