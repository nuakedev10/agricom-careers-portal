const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/applications', require('./routes/applications'));

// Apply page route
app.get('/apply', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/apply.html'));
});

// Admin dashboard route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Catch-all route
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📄 Homepage: http://localhost:${PORT}`);
    console.log(`📝 Apply page: http://localhost:${PORT}/apply`);
    console.log(`🔧 Admin dashboard: http://localhost:${PORT}/admin`);
});