import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { signAccessToken, generateRefreshToken, hashToken } from '../utils/tokens.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const { rows } = await pool.query(
      'SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL)`,
      [user.id, tokenHash, REFRESH_DAYS]
    );

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/refresh (Rotates refresh token securely)
router.post('/refresh', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const tokenHash = hashToken(refreshToken);
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT rt.id, rt.user_id, u.email, u.full_name, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    const record = rows[0];
    if (!record || !record.is_active) {
      await client.query('ROLLBACK');
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Revoke old token and issue a new pair
    await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [record.id]);

    const newRefreshToken = generateRefreshToken();
    const newHash = hashToken(newRefreshToken);

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL)`,
      [record.user_id, newHash, REFRESH_DAYS]
    );

    await client.query('COMMIT');

    const accessToken = signAccessToken({
      id: record.user_id,
      email: record.email,
      full_name: record.full_name,
      role: record.role,
    });

    return res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
});

// POST /auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
        [hashToken(refreshToken)]
      );
    }
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

// GET /auth/me
router.get('/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
});

export default router;