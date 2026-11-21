import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';

const hash = await bcrypt.hash('Password123!', 10);
await pool.query('UPDATE users SET password_hash = $1', [hash]);
console.log('Updated all seeded user passwords to: Password123!');
await pool.end();