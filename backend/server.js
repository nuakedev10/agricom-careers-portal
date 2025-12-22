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

// --- SECURITY FOR ADMIN PAGES ---
// Password protect files page and admin pages
const basicAuth = (req, res, next) => {
    // Set your username and password here
    const auth = { 
        login: 'admin', 
        password: 'Juniornuake@7910!' // ⚠️ CHANGE THIS TO YOUR SECURE PASSWORD!
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

// Get all applications (admin) - PROTECTED
app.get('/api/applications', basicAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM applications ORDER BY submitted_at DESC');
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

// --- PROTECTED ADMIN PAGES ---

// Simple file browser for admin (PROTECTED)
app.get('/files', basicAuth, (req, res) => {
    try {
        const files = fs.readdirSync(uploadDir);
        
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Uploaded Files - Agricom Admin</title>
                <style>
                    body { 
                        font-family: 'Poppins', sans-serif; 
                        margin: 40px; 
                        background: #f8fafc;
                    }
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        background: white;
                        padding: 2rem;
                        border-radius: 12px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    h1 { 
                        color: #1e3a8a; 
                        margin-bottom: 2rem;
                        border-bottom: 2px solid #3b82f6;
                        padding-bottom: 1rem;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 2rem;
                    }
                    .stats {
                        background: #f0f9ff;
                        padding: 1rem;
                        border-radius: 8px;
                        margin-bottom: 2rem;
                    }
                    .file-list { 
                        margin-top: 20px; 
                    }
                    .file-item { 
                        padding: 15px; 
                        border-bottom: 1px solid #e2e8f0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        transition: background 0.3s;
                    }
                    .file-item:hover {
                        background: #f8fafc;
                    }
                    .file-info {
                        flex: 1;
                    }
                    .file-name { 
                        color: #3b82f6; 
                        font-weight: 500;
                        font-size: 1.1rem;
                    }
                    .file-details {
                        color: #64748b;
                        font-size: 0.9em;
                        margin-top: 5px;
                    }
                    .file-actions {
                        display: flex;
                        gap: 10px;
                    }
                    .action-btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 500;
                        text-decoration: none;
                        display: inline-block;
                        transition: all 0.3s;
                    }
                    .btn-view {
                        background: #3b82f6;
                        color: white;
                    }
                    .btn-download {
                        background: #10b981;
                        color: white;
                    }
                    .btn-back {
                        background: #64748b;
                        color: white;
                    }
                    .action-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    }
                    .file-icon {
                        font-size: 1.2rem;
                        margin-right: 10px;
                    }
                    .empty-state {
                        text-align: center;
                        padding: 3rem;
                        color: #64748b;
                    }
                    @media (max-width: 768px) {
                        body { margin: 20px; }
                        .container { padding: 1rem; }
                        .file-item {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 10px;
                        }
                        .file-actions {
                            width: 100%;
                            justify-content: flex-start;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📁 Uploaded Files (${files.length})</h1>
                        <a href="/admin" class="action-btn btn-back">← Back to Admin</a>
                    </div>
                    
                    <div class="stats">
                        <strong>Total Files:</strong> ${files.length} | 
                        <strong>PDFs:</strong> ${files.filter(f => f.toLowerCase().endsWith('.pdf')).length} | 
                        <strong>DOC/DOCX:</strong> ${files.filter(f => f.toLowerCase().endsWith('.doc') || f.toLowerCase().endsWith('.docx')).length}
                    </div>
                    
                    <div class="file-list">
        `;
        
        if (files.length === 0) {
            html += `
                <div class="empty-state">
                    <p>No files have been uploaded yet.</p>
                </div>
            `;
        } else {
            files.forEach(file => {
                const filePath = path.join(uploadDir, file);
                const stats = fs.statSync(filePath);
                const size = (stats.size / 1024).toFixed(2); // KB
                const extension = file.split('.').pop().toLowerCase();
                const icon = extension === 'pdf' ? '📄' : 
                            (['doc', 'docx'].includes(extension) ? '📝' : '📎');
                
                html += `
                    <div class="file-item">
                        <div class="file-info">
                            <div class="file-name">
                                <span class="file-icon">${icon}</span>
                                ${file}
                            </div>
                            <div class="file-details">
                                ${size} KB • Uploaded: ${stats.birthtime.toLocaleDateString()}
                            </div>
                        </div>
                        <div class="file-actions">
                            <a href="/uploads/${file}" target="_blank" class="action-btn btn-view">View</a>
                            <a href="/uploads/${file}" download class="action-btn btn-download">Download</a>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                    </div>
                </div>
            </body>
            </html>
        `;
        
        res.send(html);
    } catch (error) {
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error - File Browser</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .error { color: #dc2626; background: #fee2e2; padding: 20px; border-radius: 8px; }
                    a { color: #3b82f6; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>Error loading files</h2>
                    <p>${error.message}</p>
                    <p><a href="/admin">← Back to Admin</a></p>
                </div>
            </body>
            </html>
        `);
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 URL: https://agricom-careers-portal.onrender.com`);
    console.log(`📝 Apply: https://agricom-careers-portal.onrender.com/apply`);
    console.log(`🔧 Admin: https://agricom-careers-portal.onrender.com/admin`);
    console.log(`🏥 Health: https://agricom-careers-portal.onrender.com/api/health`);
    console.log(`🔧 DB Fix: https://agricom-careers-portal.onrender.com/api/fix-db`);
    console.log(`📁 Files: https://agricom-careers-portal.onrender.com/files`);
    console.log(`\n⚠️ IMPORTANT: Change the admin password in server.js (line ~90)`);
});