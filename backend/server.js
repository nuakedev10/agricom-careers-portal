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
                    cv_data BYTEA,
                    cv_filename VARCHAR(255),
                    cv_mimetype VARCHAR(100),
                    cover_letter_data BYTEA,
                    cover_letter_filename VARCHAR(255),
                    cover_letter_mimetype VARCHAR(100),
                    consent BOOLEAN NOT NULL,
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(20) DEFAULT 'pending',
                    notes TEXT
                );
            `);
            console.log('✅ Created applications table with file storage');
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
            
            // Add missing columns for file storage
            const requiredColumns = [
                { name: 'alx_status', type: 'VARCHAR(50)', default: "'Not specified'" },
                { name: 'current_role_text', type: 'TEXT' },
                { name: 'domain_knowledge', type: 'TEXT' },
                { name: 'portfolio_link', type: 'TEXT' },
                { name: 'skills', type: 'TEXT[]' },
                { name: 'cv_data', type: 'BYTEA' },
                { name: 'cv_filename', type: 'VARCHAR(255)' },
                { name: 'cv_mimetype', type: 'VARCHAR(100)' },
                { name: 'cover_letter_data', type: 'BYTEA' },
                { name: 'cover_letter_filename', type: 'VARCHAR(255)' },
                { name: 'cover_letter_mimetype', type: 'VARCHAR(100)' },
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
// Memory storage for multer (files stored in memory, then saved to database)
const storage = multer.memoryStorage(); // Store files in memory

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// --- SECURITY FOR ADMIN PAGES ---
const basicAuth = (req, res, next) => {
    const auth = { 
        login: 'admin', 
        password: 'Juniornuake@7910!' // ⚠️ CHANGE THIS!
    };
    
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    
    if (login === auth.login && password === auth.password) {
        return next();
    }
    
    res.set('WWW-Authenticate', 'Basic realm="Agricom Admin Area"');
    res.status(401).send('Authentication required');
};

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

// --- FILE DOWNLOAD ENDPOINTS ---

// Download CV
app.get('/api/files/cv/:id', basicAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT cv_filename, cv_mimetype, cv_data FROM applications WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0 || !result.rows[0].cv_data) {
            return res.status(404).json({ error: 'CV not found' });
        }
        
        const { cv_filename, cv_mimetype, cv_data } = result.rows[0];
        
        res.setHeader('Content-Type', cv_mimetype || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${cv_filename}"`);
        res.send(cv_data);
        
    } catch (error) {
        console.error('Error downloading CV:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download Cover Letter
app.get('/api/files/cover-letter/:id', basicAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT cover_letter_filename, cover_letter_mimetype, cover_letter_data FROM applications WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0 || !result.rows[0].cover_letter_data) {
            return res.status(404).json({ error: 'Cover letter not found' });
        }
        
        const { cover_letter_filename, cover_letter_mimetype, cover_letter_data } = result.rows[0];
        
        res.setHeader('Content-Type', cover_letter_mimetype || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${cover_letter_filename}"`);
        res.send(cover_letter_data);
        
    } catch (error) {
        console.error('Error downloading cover letter:', error);
        res.status(500).json({ error: error.message });
    }
});

// View CV (inline in browser)
app.get('/api/files/cv/:id/view', basicAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT cv_filename, cv_mimetype, cv_data FROM applications WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0 || !result.rows[0].cv_data) {
            return res.status(404).json({ error: 'CV not found' });
        }
        
        const { cv_filename, cv_mimetype, cv_data } = result.rows[0];
        
        res.setHeader('Content-Type', cv_mimetype || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${cv_filename}"`);
        res.send(cv_data);
        
    } catch (error) {
        console.error('Error viewing CV:', error);
        res.status(500).json({ error: error.message });
    }
});

// View Cover Letter (inline in browser)
app.get('/api/files/cover-letter/:id/view', basicAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT cover_letter_filename, cover_letter_mimetype, cover_letter_data FROM applications WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0 || !result.rows[0].cover_letter_data) {
            return res.status(404).json({ error: 'Cover letter not found' });
        }
        
        const { cover_letter_filename, cover_letter_mimetype, cover_letter_data } = result.rows[0];
        
        res.setHeader('Content-Type', cover_letter_mimetype || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${cover_letter_filename}"`);
        res.send(cover_letter_data);
        
    } catch (error) {
        console.error('Error viewing cover letter:', error);
        res.status(500).json({ error: error.message });
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
                skillsArray = skills.includes(',') 
                    ? skills.split(',').map(s => s.trim()).filter(s => s)
                    : [skills];
            }
        }

        // Handle file uploads
        let cvData = null;
        let cvFilename = null;
        let cvMimetype = null;
        
        let coverLetterData = null;
        let coverLetterFilename = null;
        let coverLetterMimetype = null;

        if (req.files && req.files['cv']) {
            const cvFile = req.files['cv'][0];
            cvData = cvFile.buffer; // Binary data
            cvFilename = cvFile.originalname;
            cvMimetype = cvFile.mimetype;
            console.log('📄 CV uploaded:', cvFilename, 'Size:', cvData.length, 'bytes');
        }

        if (req.files && req.files['coverLetter']) {
            const coverLetterFile = req.files['coverLetter'][0];
            coverLetterData = coverLetterFile.buffer;
            coverLetterFilename = coverLetterFile.originalname;
            coverLetterMimetype = coverLetterFile.mimetype;
            console.log('📄 Cover letter uploaded:', coverLetterFilename, 'Size:', coverLetterData.length, 'bytes');
        }

        // Insert application with file data
        const query = `
            INSERT INTO applications (
                full_name, email, phone, location, alx_status, position, 
                education, current_role_text, experience, technical_skills, 
                domain_knowledge, portfolio_link, motivation, skills, 
                cv_data, cv_filename, cv_mimetype,
                cover_letter_data, cover_letter_filename, cover_letter_mimetype,
                consent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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
            cvData,
            cvFilename,
            cvMimetype,
            coverLetterData,
            coverLetterFilename,
            coverLetterMimetype,
            consent === 'on' || consent === 'true' || consent === true || false
        ];

        console.log('💾 Executing query...');

        const result = await pool.query(query, values);
        
        console.log('✅ Application saved with ID:', result.rows[0].id);
        
        res.status(200).json({ 
            success: true, 
            message: 'Application submitted successfully!', 
            applicationId: result.rows[0].id 
        });
        
    } catch (error) {
        console.error('❌ Submission Error Details:', error.message);
        
        res.status(500).json({ 
            success: false, 
            error: 'Application submission failed.',
            details: error.message
        });
    }
});

// Get all applications (admin) - PROTECTED
app.get('/api/applications', basicAuth, async (req, res) => {
    try {
        // Don't include the binary data in the list view (too large)
        const result = await pool.query(`
            SELECT 
                id,
                full_name,
                email,
                phone,
                location,
                alx_status,
                position,
                education,
                current_role_text,
                experience,
                technical_skills,
                domain_knowledge,
                portfolio_link,
                motivation,
                skills,
                cv_filename,
                cv_mimetype,
                cover_letter_filename,
                cover_letter_mimetype,
                consent,
                submitted_at,
                status,
                notes,
                cv_data IS NOT NULL as has_cv,
                cover_letter_data IS NOT NULL as has_cover_letter
            FROM applications 
            ORDER BY submitted_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single application with file info (admin) - PROTECTED
app.get('/api/applications/:id', basicAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT 
                id,
                full_name,
                email,
                phone,
                location,
                alx_status,
                position,
                education,
                current_role_text,
                experience,
                technical_skills,
                domain_knowledge,
                portfolio_link,
                motivation,
                skills,
                cv_filename,
                cv_mimetype,
                cover_letter_filename,
                cover_letter_mimetype,
                consent,
                submitted_at,
                status,
                notes,
                cv_data IS NOT NULL as has_cv,
                cover_letter_data IS NOT NULL as has_cover_letter
            FROM applications WHERE id = $1`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update application status (admin) - PROTECTED
app.put('/api/applications/:id', basicAuth, async (req, res) => {
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

// Protect admin page
app.get('/admin', basicAuth, (req, res) => {
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
    console.log(`\n⚠️ IMPORTANT: Change the admin password in server.js (line ~90)`);
    console.log(`📁 Files are now stored in DATABASE (not filesystem)`);
});