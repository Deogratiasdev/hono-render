import mongoose from 'mongoose';

/**
 * Nettoie complètement la base MongoDB courante.
 * À utiliser uniquement en développement / tests.
 */
export async function cleanupDatabase() {
  const db = mongoose.connection;

  if (db.readyState !== 1) {
    console.warn('[cleanupDatabase] Connexion MongoDB non prête (state =', db.readyState, ')');
  }

  console.log('=== DEMANDE DE NETTOYAGE COMPLET DE LA BASE ===');
  console.log('Base actuelle :', db.name, 'sur', db.host);

  try {
    await db.dropDatabase();
    console.log('✅ Base MongoDB vidée avec succès.');
  } catch (err) {
    console.error('❌ Erreur lors du nettoyage de la base :', err);
    throw err;
  }
}
