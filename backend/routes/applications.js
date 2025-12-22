const express = require('express');
const router = express.Router();
const db = require('../database');

// POST: Submit new application
router.post('/', async (req, res) => {
    try {
        const {
            fullName,
            email,
            phone,
            location,
            alxStatus,
            position,
            education,
            currentRole,
            experience,
            technicalSkills,
            domainKnowledge,
            portfolioLink,
            motivation,
            skills,
            cvFilename,
            coverLetterFilename,
            consent
        } = req.body.application;
        
        // Validate required fields
        if (!fullName || !email || !phone || !position || !consent) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }
        
        // Insert into database
        const query = `
            INSERT INTO applications (
                full_name, email, phone, location, alx_status, position, education,
                current_role_text, experience, technical_skills, domain_knowledge,
                portfolio_link, motivation, skills, cv_filename,
                cover_letter_filename, consent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING id, submitted_at
        `;
        
        const values = [
            fullName,
            email,
            phone,
            location,
            alxStatus || 'Not specified',
            position,
            education,
            currentRole || null,
            experience,
            technicalSkills,
            domainKnowledge || null,
            portfolioLink || null,
            motivation,
            skills,
            cvFilename || null,
            coverLetterFilename || null,
            consent
        ];
        
        const result = await db.query(query, values);
        
        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: result.rows[0].id,
            submittedAt: result.rows[0].submitted_at
        });
        
    } catch (error) {
        console.error('Error submitting application:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// GET: Retrieve all applications (for admin dashboard)
router.get('/', async (req, res) => {
    try {
        const query = `
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
                cover_letter_filename,
                consent,
                submitted_at,
                status,
                notes
            FROM applications 
            ORDER BY submitted_at DESC
        `;
        
        const result = await db.query(query);
        res.json(result.rows);
        
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET: Retrieve single application by ID
router.get('/:id', async (req, res) => {
    try {
        const query = 'SELECT * FROM applications WHERE id = $1';
        const result = await db.query(query, [req.params.id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        res.json({
            success: true,
            application: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT: Update application status
router.put('/:id/status', async (req, res) => {
    try {
        const { status, notes } = req.body;
        
        if (!status || !['pending', 'reviewed', 'accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const query = `
            UPDATE applications 
            SET status = $1, notes = $2 
            WHERE id = $3 
            RETURNING id, status
        `;
        
        const result = await db.query(query, [status, notes || null, req.params.id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        res.json({
            success: true,
            message: 'Status updated successfully',
            application: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE: Remove application (for GDPR compliance)
router.delete('/:id', async (req, res) => {
    try {
        const query = 'DELETE FROM applications WHERE id = $1 RETURNING id';
        const result = await db.query(query, [req.params.id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        res.json({
            success: true,
            message: 'Application deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting application:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;