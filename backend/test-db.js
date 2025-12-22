const { Pool } = require('pg');
require('dotenv').config();

async function testDatabase() {
    console.log('🧪 Testing database connection...');
    
    const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log('✅ Database connection successful!');
        
        // Test query
        const result = await client.query('SELECT NOW() as time');
        console.log('⏰ Database time:', result.rows[0].time);
        
        // Check if applications table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'applications'
            );
        `);
        
        console.log('📊 Applications table exists:', tableCheck.rows[0].exists);
        
        if (tableCheck.rows[0].exists) {
            const countResult = await client.query('SELECT COUNT(*) FROM applications');
            console.log('📈 Total applications:', countResult.rows[0].count);
        }
        
        client.release();
        await pool.end();
        
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
        console.log('\n🔧 Check your .env file configuration:');
        console.log('DB_USER:', process.env.DB_USER);
        console.log('DB_HOST:', process.env.DB_HOST);
        console.log('DB_NAME:', process.env.DB_NAME);
        console.log('DB_PORT:', process.env.DB_PORT);
    }
}

testDatabase();