import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticate);

// Helper: verify user can access a specific application
async function getAuthorizedApp(appId, user) {
  const { rows } = await pool.query(
    `SELECT a.*,
            u1.full_name AS created_by_name,
            u2.full_name AS assigned_reviewer_name
     FROM merchant_applications a
     LEFT JOIN users u1 ON u1.id = a.created_by
     LEFT JOIN users u2 ON u2.id = a.assigned_reviewer_id
     WHERE a.id = $1`,
    [appId]
  );
  const app = rows[0];
  if (!app) return { error: 404, message: 'Application not found' };

  if (user.role === 'SALES' && app.created_by !== user.id) {
    return { error: 403, message: 'Forbidden: you can only access your own applications' };
  }
  if (user.role === 'REVIEWER' && app.assigned_reviewer_id !== user.id) {
    return { error: 403, message: 'Forbidden: application is not assigned to you' };
  }
  return { app };
}

// Helper: strip encrypted columns so sensitive data is never leaked by default
function sanitizeApplication(app) {
  const { owner_tax_id_encrypted, account_number_encrypted, ...safe } = app;
  return {
    ...safe,
    owner_tax_id_masked: app.owner_tax_id_last4 ? `***-**-${app.owner_tax_id_last4}` : null,
    account_number_masked: app.account_number_last4 ? `****${app.account_number_last4}` : null,
  };
}

// GET /api/applications (Server-side pagination, filtering, RBAC scoping)
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const { status, search } = req.query;

    const conditions = [];
    const params = [];

    if (req.user.role === 'SALES') {
      params.push(req.user.id);
      conditions.push(`a.created_by = $${params.length}`);
    } else if (req.user.role === 'REVIEWER') {
      params.push(req.user.id);
      conditions.push(`a.assigned_reviewer_id = $${params.length}`);
    }

    if (status && status !== 'ALL') {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }

    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(a.business_name ILIKE $${params.length} OR a.application_number ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM merchant_applications a ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limit, offset);
    const dataResult = await pool.query(
      `SELECT a.id, a.application_number, a.status, a.business_name, a.legal_entity_type,
              a.industry_category, a.expected_monthly_volume, a.current_step,
              a.created_at, a.updated_at, a.submitted_at,
              a.created_by, a.assigned_reviewer_id,
              u1.full_name AS created_by_name,
              u2.full_name AS assigned_reviewer_name
       FROM merchant_applications a
       LEFT JOIN users u1 ON u1.id = a.created_by
       LEFT JOIN users u2 ON u2.id = a.assigned_reviewer_id
       ${whereClause}
       ORDER BY a.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      data: dataResult.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/applications/reviewers (ADMIN only - for assignment dropdown)
router.get('/reviewers', authorize('ADMIN'), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, email FROM users WHERE role = 'REVIEWER' AND is_active = TRUE ORDER BY full_name`
    );
    return res.json({ reviewers: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /api/applications (Create new DRAFT - SALES or ADMIN)
router.post('/', authorize('SALES', 'ADMIN'), async (req, res, next) => {
  try {
    const appNumber = `APP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { business_name = null } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO merchant_applications (application_number, created_by, business_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [appNumber, req.user.id, business_name]
    );

    return res.status(201).json({ application: sanitizeApplication(rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// GET /api/applications/:id (Detail + Risk Review History)
router.get('/:id', async (req, res, next) => {
  try {
    const { app, error, message } = await getAuthorizedApp(req.params.id, req.user);
    if (error) return res.status(error).json({ message });

    const reviewsRes = await pool.query(
      `SELECT r.id, r.decision, r.risk_score, r.notes, r.created_at, u.full_name AS reviewer_name
       FROM risk_reviews r
       JOIN users u ON u.id = r.reviewer_id
       WHERE r.application_id = $1
       ORDER BY r.created_at DESC`,
      [app.id]
    );

    return res.json({
      application: sanitizeApplication(app),
      reviews: reviewsRes.rows,
    });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/applications/:id/draft (Auto-save draft with optimistic locking)
router.patch('/:id/draft', authorize('SALES', 'ADMIN'), async (req, res, next) => {
  try {
    const { app, error, message } = await getAuthorizedApp(req.params.id, req.user);
    if (error) return res.status(error).json({ message });

    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(app.status)) {
      return res.status(409).json({ message: 'Only DRAFT or CHANGES_REQUESTED applications can be edited' });
    }

    const b = req.body;
    const taxIdLast4 = b.owner_tax_id ? String(b.owner_tax_id).slice(-4) : app.owner_tax_id_last4;
    const taxIdEnc = b.owner_tax_id ? `ENC_MOCK_${b.owner_tax_id}` : app.owner_tax_id_encrypted;
    const acctLast4 = b.account_number ? String(b.account_number).slice(-4) : app.account_number_last4;
    const acctEnc = b.account_number ? `ENC_MOCK_${b.account_number}` : app.account_number_encrypted;

    const { rows } = await pool.query(
      `UPDATE merchant_applications SET
        business_name = COALESCE($1, business_name),
        legal_entity_type = COALESCE($2, legal_entity_type),
        registration_number = COALESCE($3, registration_number),
        industry_category = COALESCE($4, industry_category),
        website_url = COALESCE($5, website_url),
        business_address = COALESCE($6, business_address),
        owner_full_name = COALESCE($7, owner_full_name),
        owner_email = COALESCE($8, owner_email),
        owner_phone = COALESCE($9, owner_phone),
        owner_tax_id_encrypted = $10,
        owner_tax_id_last4 = $11,
        bank_name = COALESCE($12, bank_name),
        routing_number = COALESCE($13, routing_number),
        account_number_encrypted = $14,
        account_number_last4 = $15,
        expected_monthly_volume = COALESCE($16, expected_monthly_volume),
        average_ticket_size = COALESCE($17, average_ticket_size),
        current_step = COALESCE($18, current_step),
        version = version + 1,
        last_saved_at = NOW()
       WHERE id = $19
       RETURNING *`,
      [
        b.business_name ?? null, b.legal_entity_type ?? null, b.registration_number ?? null,
        b.industry_category ?? null, b.website_url ?? null, b.business_address ?? null,
        b.owner_full_name ?? null, b.owner_email ?? null, b.owner_phone ?? null,
        taxIdEnc, taxIdLast4,
        b.bank_name ?? null, b.routing_number ?? null,
        acctEnc, acctLast4,
        b.expected_monthly_volume ?? null, b.average_ticket_size ?? null,
        b.current_step ?? null,
        app.id,
      ]
    );

    return res.json({ application: sanitizeApplication(rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/applications/:id/submit (Final validation & transition to SUBMITTED)
router.post('/:id/submit', authorize('SALES', 'ADMIN'), async (req, res, next) => {
  try {
    const { app, error, message } = await getAuthorizedApp(req.params.id, req.user);
    if (error) return res.status(error).json({ message });

    const requiredFields = ['business_name', 'legal_entity_type', 'owner_full_name', 'owner_email', 'bank_name', 'routing_number'];
    const missing = requiredFields.filter((f) => !app[f]);
    if (missing.length > 0) {
      return res.status(400).json({ message: 'Incomplete application', missingFields: missing });
    }

    const { rows } = await pool.query(
      `UPDATE merchant_applications
       SET status = 'SUBMITTED', submitted_at = NOW(), current_step = 4
       WHERE id = $1
       RETURNING *`,
      [app.id]
    );

    return res.json({ application: sanitizeApplication(rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/applications/:id/assign (ADMIN only)
router.patch('/:id/assign', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { reviewerId } = req.body;
    const { rows } = await pool.query(
      `UPDATE merchant_applications
       SET assigned_reviewer_id = $1,
           status = CASE WHEN status = 'SUBMITTED' THEN 'IN_REVIEW' ELSE status END
       WHERE id = $2
       RETURNING *`,
      [reviewerId || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Application not found' });
    return res.json({ application: sanitizeApplication(rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/applications/:id/reviews (REVIEWER or ADMIN)
router.post('/:id/reviews', authorize('REVIEWER', 'ADMIN'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { app, error, message } = await getAuthorizedApp(req.params.id, req.user);
    if (error) return res.status(error).json({ message });

    const { decision, riskScore, notes } = req.body;
    if (!['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'COMMENT'].includes(decision) || !notes?.trim()) {
      return res.status(400).json({ message: 'Valid decision and notes are required' });
    }

    await client.query('BEGIN');
    const reviewRes = await client.query(
      `INSERT INTO risk_reviews (application_id, reviewer_id, decision, risk_score, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [app.id, req.user.id, decision, riskScore ?? null, notes.trim()]
    );

    if (decision !== 'COMMENT') {
      await client.query(
        'UPDATE merchant_applications SET status = $1 WHERE id = $2',
        [decision, app.id]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ review: reviewRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
});

// POST /api/applications/:id/reveal (Controlled role-based reveal + audit log)
router.post('/:id/reveal', authorize('REVIEWER', 'ADMIN'), async (req, res, next) => {
  try {
    const { app, error, message } = await getAuthorizedApp(req.params.id, req.user);
    if (error) return res.status(error).json({ message });

    const { field } = req.body;
    const fieldMap = {
      owner_tax_id: app.owner_tax_id_encrypted,
      account_number: app.account_number_encrypted,
    };

    if (!(field in fieldMap)) {
      return res.status(400).json({ message: 'Invalid sensitive field requested' });
    }

    await pool.query(
      'INSERT INTO sensitive_access_logs (application_id, user_id, field_name) VALUES ($1, $2, $3)',
      [app.id, req.user.id, field]
    );

    const rawValue = fieldMap[field] ? fieldMap[field].replace(/^ENC_MOCK_/, '') : null;
    return res.json({ field, value: rawValue });
  } catch (err) {
    return next(err);
  }
});

export default router;