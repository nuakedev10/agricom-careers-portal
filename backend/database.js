const createTable = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS applications (
            id SERIAL PRIMARY KEY,
            full_name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            location VARCHAR(100) NOT NULL,
            alx_status VARCHAR(50),
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
    
    // Add column if it doesn't exist (for existing databases)
    const addColumnQuery = `
        DO $$ 
        BEGIN 
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='applications' AND column_name='alx_status'
            ) THEN
                ALTER TABLE applications ADD COLUMN alx_status VARCHAR(50);
            END IF;
        END $$;
    `;
    
    try {
        await pool.query(createTableQuery);
        console.log('Applications table created or already exists');
        
        await pool.query(addColumnQuery);
        console.log('ALX status column added or already exists');
        
        await pool.query(createIndexes);
        console.log('Indexes created or already exist');
        
    } catch (error) {
        console.error('Error creating table:', error.message);
    }
};