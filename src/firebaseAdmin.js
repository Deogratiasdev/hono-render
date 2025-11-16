import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
import 'dotenv/config';

const require = createRequire(import.meta.url);

// Chemin absolu vers le fichier de credentials
const serviceAccountPath = resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);

if (!serviceAccountPath) {
  throw new Error('La variable d\'environnement GOOGLE_APPLICATION_CREDENTIALS n\'est pas définie');
}

// Chargement du fichier de configuration
const serviceAccount = require(serviceAccountPath);

// Initialisation de Firebase Admin
if (!admin.apps.length) {
  try {
    // Vérifier que l'ID de projet est disponible
    const projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error('Aucun ID de projet Firebase trouvé dans la configuration');
    }

    // Initialiser avec la configuration complète
    admin.initializeApp({
      credential: admin.credential.cert({
        ...serviceAccount,
        projectId: projectId
      }),
      databaseURL: `https://${projectId}.firebaseio.com`
    });
    
    console.log(`✅ Firebase Admin initialisé avec succès pour le projet: ${projectId}`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation de Firebase Admin:', error);
    throw error;
  }
}

export const firestore = admin.firestore();
export const auth = admin.auth();
export const messaging = admin.messaging();
