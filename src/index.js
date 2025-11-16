// Charger les variables d'environnement en premier
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import cors from 'cors';
import mongoose from 'mongoose';
import connectDB from './db/mongodb.js';
import { verifyFirebaseToken } from './middleware/auth.js';
import siteRoutes from './routes/siteRoutes.js';
import cleanupRoutes from './routes/cleanupRoutes.js';
import { errorHandler } from './utils/errorHandler.js';

// Initialiser Firebase Admin
import './firebaseAdmin.js';

// Vérification des variables d'environnement requises
const requiredEnvVars = ['MONGODB_URI'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Variables d\'environnement manquantes :', missingVars.join(', '));
  process.exit(1);
}

// Initialisation de la connexion à MongoDB
await connectDB();

const app = new Hono();

// Configuration CORS
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '*';

  // Répondre aux requêtes OPTIONS (preflight)
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Max-Age', '600');
    c.status(204);
    return c.body(null);
  }

  // Pour les autres requêtes
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Vary', 'Origin');
  c.header('Access-Control-Allow-Credentials', 'true');

  return next();
});

// Middleware d'authentification pour les routes /user/*
app.use('/user/*', verifyFirebaseToken);

// Routes protégées
app.route('/user', siteRoutes);

// Routes d'administration (nettoyage DB, etc.) - désactivées en production
if (process.env.NODE_ENV !== 'production') {
  app.route('/admin', cleanupRoutes);
}

// Routes publiques
app.get('/', (c) => {
  return c.text('Bienvenue sur l\'API Hono!');
});

// Exemple de route protégée
app.get('/user/profile', (c) => {
  const user = c.get('user');
  return c.json({ 
    message: 'Profil utilisateur protégé',
    user: {
      uid: user.uid,
      email: user.email
    }
  });
});

// Route de santé améliorée
app.get('/health', (c) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  return c.json({ 
    status: 'ok',
    database: {
      status: dbStatus,
      name: mongoose.connection.name,
      host: mongoose.connection.host
    },
    timestamp: new Date().toISOString()
  });
});

// Gestion des erreurs globales
app.onError((err, c) => {
  return errorHandler(err, c);
});

// Démarrer le serveur
const port = process.env.PORT || 3001;
serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`Serveur démarré sur http://localhost:${info.port}`);
});
