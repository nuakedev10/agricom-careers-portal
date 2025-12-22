// Simple script to add alx_status column to production database
const { Pool } = require('pg');

console.log('Starting database fix...');

const pool = new Pool({
    host: 'dpg-d54gm3ngi27c73ea1b80-a',
    port: 5432,
    database: 'agricom_applications',
    user: 'agricom_admin',
    password: 'BMrYHlxdqIzhPk01cG8ANm6Vggsyy7bq',
    ssl: { rejectUnauthorized: false }
});

async function fixDatabase() {
    let client;
    try {
        client = await pool.connect();
        console.log('✅ Connected to Render database');
        
        // Add the missing column
        await client.query(`
            ALTER TABLE applications 
            ADD COLUMN IF NOT EXISTS alx_status VARCHAR(50) DEFAULT 'Not specified'
        `);
        console.log('✅ Added alx_status column');
        
        // Verify
        const result = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'applications' 
            AND column_name = 'alx_status'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ Verification: alx_status column exists');
        } else {
            console.log('⚠️ Column might not have been added');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.log('\nPossible issues:');
        console.log('1. Database not ready - wait 5 minutes');
        console.log('2. Check Render dashboard if database is "Available"');
        console.log('3. Password might be incorrect');
        
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('\nConnection closed.');
    }
}

fixDatabase();