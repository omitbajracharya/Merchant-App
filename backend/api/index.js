import 'dotenv/config';
import app from '../src/app.js';

const PORT = process.env.PORT || 4000;

// Only start a local server when NOT running on Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

export default app;