import { Hono } from 'hono';
import { cleanupDatabase } from '../utils/cleanupDb.js';

const router = new Hono();

// Route de nettoyage complet de la base MongoDB
// ATTENTION : destinée uniquement aux environnements de développement / tests.
router.post('/cleanup-db', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({
      error: 'Cleanup route disabled in production',
    }, 403);
  }

  try {
    await cleanupDatabase();
    return c.json({
      status: 'ok',
      message: 'Base MongoDB nettoyée avec succès',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cleanup-db] Erreur:', err);
    return c.json({
      error: 'Erreur lors du nettoyage de la base',
      details: err?.message || String(err),
    }, 500);
  }
});

export default router;
