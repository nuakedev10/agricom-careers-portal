const { Pool } = require('pg');

console.log('Adding missing six_status column...');

const pool = new Pool({
    host: 'dpg-d54gm3ngi27c73ea1b80-a.oregon-postgres.render.com',
    port: 5432,
    database: 'agricom_applications',
    user: 'agricom_admin',
    password: 'BMrYHlxdqIzhPk01cG8ANm6Vggsyy7bq',
    ssl: { rejectUnauthorized: false }
});

async function fix() {
    try {
        const client = await pool.connect();
        
        // Add the column that the OLD code expects
        await client.query(`
            ALTER TABLE applications 
            ADD COLUMN IF NOT EXISTS six_status VARCHAR(50) DEFAULT 'Not specified'
        `);
        console.log('✅ Added six_status column (temporary fix for old code)');
        
        client.release();
        
        console.log('\n🎉 FORM SHOULD WORK NOW!');
        console.log('Test at: https://agricom-careers-portal.onrender.com/apply');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

fix();