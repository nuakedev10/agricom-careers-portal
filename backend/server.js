const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

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

// --- SIMPLIFIED TABLE CREATION ---
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
            // Create simplified table (no file columns)
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
                    cv_email_confirmation VARCHAR(50) NOT NULL,
                    consent BOOLEAN NOT NULL,
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(20) DEFAULT 'pending',
                    notes TEXT
                );
            `);
            console.log('✅ Created applications table (simplified)');
        } else {
            console.log('✅ Applications table exists');
            
            // Remove file-related columns if they exist
            await pool.query(`
                ALTER TABLE applications 
                DROP COLUMN IF EXISTS cv_filename,
                DROP COLUMN IF EXISTS cv_mimetype,
                DROP COLUMN IF EXISTS cv_data,
                DROP COLUMN IF EXISTS cover_letter_filename,
                DROP COLUMN IF EXISTS cover_letter_mimetype,
                DROP COLUMN IF EXISTS cover_letter_data;
            `);
            
            // Add cv_email_confirmation column if it doesn't exist
            const columns = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'applications' 
                AND table_schema = 'public'
            `);
            
            const existingColumns = columns.rows.map(row => row.column_name);
            
            if (!existingColumns.includes('cv_email_confirmation')) {
                await pool.query(`
                    ALTER TABLE applications 
                    ADD COLUMN cv_email_confirmation VARCHAR(50) DEFAULT 'Not specified'
                `);
                console.log('✅ Added cv_email_confirmation column');
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

// --- APPLICATION ROUTES ---

// Submit Application (NO FILE UPLOAD)
app.post('/api/applications', async (req, res) => {
    console.log('📥 Received application submission');
    
    try {
        const {
            fullName, email, phone, location, alxStatus, position, 
            education, currentRole, experience, technicalSkills, 
            domainKnowledge, portfolioLink, motivation, 
            cvEmailConfirmation, consent
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

        // Insert application (no file data)
        const query = `
            INSERT INTO applications (
                full_name, email, phone, location, alx_status, position, 
                education, current_role_text, experience, technical_skills, 
                domain_knowledge, portfolio_link, motivation, skills, 
                cv_email_confirmation, consent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
            cvEmailConfirmation || 'Not specified',
            consent === 'on' || consent === 'true' || consent === true || false
        ];

        console.log('💾 Executing query with values:', values);

        const result = await pool.query(query, values);
        
        console.log('✅ Application saved with ID:', result.rows[0].id);
        
        res.status(200).json({ 
            success: true, 
            message: 'Application submitted successfully! Please remember to email your CV to agricomassurance@gmail.com and derricka@agricomassurance.com', 
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
                cv_email_confirmation,
                consent,
                submitted_at,
                status,
                notes
            FROM applications 
            ORDER BY submitted_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching applications:', error);
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
    console.log(`\n⚠️ IMPORTANT: Change the admin password in server.js (line ~80)`);
    console.log(`📧 Applicants will now email CVs to: agricomassurance@gmail.com & derricka@agricomassurance.com`);
});