import dotenv from 'dotenv';
import app from '../src/app.js';

dotenv.config();

// Local development listener (Vercel ignores this and uses the default export)
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}

export default app;