const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Create a connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    // Fallback to individual config if DATABASE_URL not available
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'agricom_applications',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to the database:', err.stack);
    } else {
        console.log('Successfully connected to PostgreSQL database');
        release();
    }
});

// Create applications table if it doesn't exist
const createTable = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS applications (
            id SERIAL PRIMARY KEY,
            full_name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            location VARCHAR(100) NOT NULL,
            position VARCHAR(50) NOT NULL,
            education TEXT NOT NULL,
            current_role_text TEXT,
            experience VARCHAR(20) NOT NULL,
            technical_skills TEXT NOT NULL,
            domain_knowledge TEXT,
            portfolio_link TEXT,
            motivation TEXT NOT NULL,
            skills TEXT[] NOT NULL,
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
        console.log('Applications table created or already exists');
        
        await pool.query(createIndexes);
        console.log('Indexes created or already exist');
        
    } catch (error) {
        console.error('Error creating table:', error.message);
    }
};

// Initialize database
createTable();

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};