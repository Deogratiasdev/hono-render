import { Hono } from 'hono';
import crypto from 'node:crypto';
import Site from '../models/Site.js';
import User from '../models/User.js';
import { ERROR_CODES, createErrorResponse } from '../utils/errorHandler.js';
import { auth as adminAuth, messaging as adminMessaging } from '../firebaseAdmin.js';

const PUBLIC_API_KEY_PREFIX = process.env.GRATIAS_PUBLIC_PREFIX || 'gratias_public_';

const router = new Hono();

/**
 * Initialisation du profil utilisateur (plan gratuit + quota)
 * POST /user/user
 * 
 * Crée un document utilisateur avec plan gratuit et quota de sites si nécessaire
 * et ajoute les claims correspondants au token Firebase.
 * Réponse: { token: 'reload' }
 */
router.post('/user', async (c) => {
  console.log('=== INIT PROFIL UTILISATEUR (PLAN GRATUIT) ===');
  try {
    const u = c.get('user');
    const uid = u.uid;

    let userDoc = await User.findOne({ uid });

    if (!userDoc) {
      userDoc = await User.create({ uid });
      console.log('Profil utilisateur créé avec plan gratuit:', {
        uid: userDoc.uid,
        pl: userDoc.pl,
        maxSites: userDoc.maxSites,
        siteCount: userDoc.siteCount
      });
    }

    // Mettre à jour les custom claims Firebase uniquement si le plan n'est pas encore présent
    const userRecord = await adminAuth.getUser(uid);
    const claims = userRecord.customClaims || {};

    if (!claims.pl) {
      const newClaims = {
        ...claims,
        pl: userDoc.pl,
        st: 'active',
        maxSites: userDoc.maxSites,
        emailNotificationsEnabled: !!userDoc.emailNotificationsEnabled
      };

      await adminAuth.setCustomUserClaims(uid, newClaims);
      console.log('Custom claims mis à jour pour l\'utilisateur:', uid, newClaims);
    } else {
      console.log('Custom claims déjà présents pour l\'utilisateur:', uid);
    }

    // Demander au frontend de recharger le token Firebase
    return c.json({ token: 'reload' });
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du profil utilisateur:', error);
    return c.json(
      createErrorResponse('SERVER_ERROR', error.message),
      ERROR_CODES.SERVER_ERROR.httpStatus
    );
  }
});

// Envoyer une notification push de test au topic de l'utilisateur
router.post('/test-notification', async (c) => {
  try {
    const user = c.get('user');
    const uid = user.uid;

    // Vérifier qu'un token push est bien enregistré pour cet utilisateur
    const userDoc = await User.findOne({ uid });
    if (!userDoc || !userDoc.pushToken) {
      return c.json(
        createErrorResponse('SERVER_ERROR', 'Aucun token push enregistré pour cet utilisateur.'),
        ERROR_CODES.SERVER_ERROR.httpStatus
      );
    }

    const topic = `user_${uid}`;

    await adminMessaging.send({
      notification: {
        title: 'Notification de test',
        body: 'Ceci est une notification push de test depuis vos paramètres.',
      },
      topic,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la notification de test:', error);
    return c.json(
      createErrorResponse('SERVER_ERROR', error.message),
      ERROR_CODES.SERVER_ERROR.httpStatus
    );
  }
});

// Activer/désactiver les notifications email
router.post('/email', async (c) => {
  try {
    const user = c.get('user');
    const uid = user.uid;

    const body = await c.req.json().catch(() => ({}));
    const enabled = !!body.enabled;

    const userDoc = await User.findOneAndUpdate(
      { uid },
      { emailNotificationsEnabled: enabled },
      { new: true }
    );

    if (!userDoc) {
      return c.json(
        createErrorResponse('SERVER_ERROR', 'Profil utilisateur introuvable'),
        ERROR_CODES.SERVER_ERROR.httpStatus
      );
    }

    // Mettre à jour les custom claims pour refléter l'état emailNotificationsEnabled
    try {
      const userRecord = await adminAuth.getUser(uid);
      const claims = userRecord.customClaims || {};

      // Gérer un message unique pour les notifications email dans msgs/msg
      let msgs = Array.isArray(claims.msgs) ? [...claims.msgs] : [];
      const emailPrefix = 'info.Notifications email ';
      msgs = msgs.filter(m => typeof m === 'string' && !m.startsWith(emailPrefix));

      const timestamp = new Date().toISOString();
      const statusText = enabled ? 'activées' : 'désactivées';
      const emailMsg = `${emailPrefix}${statusText} le ${timestamp}`;
      msgs.push(emailMsg);

      const newClaims = {
        ...claims,
        emailNotificationsEnabled: !!userDoc.emailNotificationsEnabled,
        msg: emailMsg,
        msgs
      };

      await adminAuth.setCustomUserClaims(uid, newClaims);
      console.log('Custom claims mis à jour pour les notifications email pour l\'utilisateur:', uid, newClaims);
    } catch (claimError) {
      console.error('Erreur lors de la mise à jour des custom claims pour les notifications email:', claimError);
    }

    return c.json({
      success: true,
      emailNotificationsEnabled: !!userDoc.emailNotificationsEnabled,
      token: 'reload'
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des notifications email:', error);
    return c.json(
      createErrorResponse('SERVER_ERROR', error.message),
      ERROR_CODES.SERVER_ERROR.httpStatus
    );
  }
});

// Enregistrer un token FCM pour les notifications push et l'abonner à un topic utilisateur
router.post('/push-token', async (c) => {
  try {
    const user = c.get('user');
    const uid = user.uid;

    const body = await c.req.json().catch(() => ({}));
    console.log('Body brut reçu sur /user/push-token:', body, 'token type:', typeof body?.token);
    const token = body.token;

    if (!token || typeof token !== 'string') {
      return c.json(
        createErrorResponse('INVALID_INPUT', 'Token FCM manquant ou invalide'),
        ERROR_CODES.INVALID_INPUT.httpStatus
      );
    }

    // Log de debug du token FCM (en clair pour le debug)
    const tokenLength = token.length;
    console.log('Token FCM reçu pour l\'utilisateur', uid, {
      length: tokenLength,
      token
    });

    // Sauvegarder le token dans le profil utilisateur
    const userDoc = await User.findOneAndUpdate(
      { uid },
      { pushToken: token },
      { new: true }
    );

    if (!userDoc) {
      return c.json(
        createErrorResponse('SERVER_ERROR', 'Profil utilisateur introuvable'),
        ERROR_CODES.SERVER_ERROR.httpStatus
      );
    }

    // Abonner le token à un topic spécifique à l'utilisateur
    const topic = `user_${uid}`;
    try {
      await adminMessaging.subscribeToTopic(token, topic);
      console.log(`Token FCM abonné au topic ${topic} pour l'utilisateur ${uid}`);
    } catch (topicError) {
      console.error('Erreur lors de l\'abonnement du token FCM au topic:', topicError);
      // On ne bloque pas la réponse pour une erreur de topic
    }

    return c.json({ success: true, pushToken: userDoc.pushToken });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du token FCM:', error);
    return c.json(
      createErrorResponse('SERVER_ERROR', error.message),
      ERROR_CODES.SERVER_ERROR.httpStatus
    );
  }
});

// Suppression complète du compte utilisateur
router.post('/deleteUser', async (c) => {
  console.log('=== DEMANDE DE SUPPRESSION DE COMPTE UTILISATEUR ===');
  try {
    const u = c.get('user');
    const uid = u.uid;

    // Récupérer le profil pour éventuellement gérer le token push
    const userDoc = await User.findOne({ uid });
    const pushToken = userDoc?.pushToken;

    // Désabonner le token push du topic utilisateur si présent
    if (pushToken) {
      const topic = `user_${uid}`;
      try {
        await adminMessaging.unsubscribeFromTopic(pushToken, topic);
        console.log(`Token FCM désabonné du topic ${topic} pour l'utilisateur ${uid}`);
      } catch (topicError) {
        console.error('Erreur lors du désabonnement du token FCM du topic:', topicError);
      }
    }

    // Supprimer les sites associés
    await Site.deleteMany({ userId: uid });

    // Supprimer le document utilisateur
    await User.deleteOne({ uid });

    // Supprimer l'utilisateur dans Firebase Auth
    await adminAuth.deleteUser(uid);
    console.log('Utilisateur supprimé dans Firebase Auth et MongoDB:', uid);

    return c.json({ success: true });
  } catch (error) {
    console.error('Erreur lors de la suppression du compte utilisateur:', error);
    return c.json(
      createErrorResponse('SERVER_ERROR', error.message),
      ERROR_CODES.SERVER_ERROR.httpStatus
    );
  }
});

/**
 * Création d'un nouveau site
 * POST /user/createSite
 * 
 * Body:
 * {
 *   siteName: string (max 15 caractères),
 *   domains: string[],
 *   siteType: 'formulaire' | 'vitrine' | 'reservation' | 'landing' | 'autres'
 * }
 */
router.post('/createSite', async (c) => {
  console.log('=== NOUVELLE DEMANDE DE CRÉATION DE SITE ===');
  console.log('En-têtes de la requête:', JSON.stringify(c.req.raw.headers, null, 2));
  try {
    const user = c.get('user');
    const userId = user.uid;

    // Récupérer le profil utilisateur pour appliquer le quota de sites
    let userDoc = await User.findOne({ uid: userId });
    if (!userDoc) {
      userDoc = await User.create({ uid: userId });
      console.log('Profil utilisateur créé à la volée pour l\'ID:', userId);
    }

    const requestBody = await c.req.json();
    const { siteName, domains, siteType } = requestBody;
    
    console.log('Utilisateur:', userId);
    console.log('Données reçues:', JSON.stringify({
      siteName,
      domains,
      siteType,
      timestamp: new Date().toISOString()
    }, null, 2));

    // Validation des entrées
    if (!siteName || !domains || !siteType) {
      console.error('Champs manquants dans la requête:', { siteName, domains, siteType });
      return c.json(
        createErrorResponse('MISSING_FIELDS'),
        ERROR_CODES.MISSING_FIELDS.httpStatus
      );
    }

    if (siteName.length > 15) {
      return c.json(
        createErrorResponse('SITE_NAME_TOO_LONG'),
        ERROR_CODES.SITE_NAME_TOO_LONG.httpStatus
      );
    }

    if (!['formulaire', 'vitrine', 'reservation', 'landing', 'autres'].includes(siteType)) {
      return c.json(
        createErrorResponse('INVALID_SITE_TYPE'),
        ERROR_CODES.INVALID_SITE_TYPE.httpStatus
      );
    }

    // Recalculer le nombre réel de sites pour cet utilisateur
    const currentSiteCount = await Site.countDocuments({ userId });

    // Vérifier le quota de sites avant toute création
    if (currentSiteCount >= userDoc.maxSites) {
      console.warn('Quota de sites atteint pour l\'utilisateur (avant création):', userId);
      return c.json(
        createErrorResponse('SITE_QUOTA_EXCEEDED'),
        ERROR_CODES.SITE_QUOTA_EXCEEDED.httpStatus
      );
    }

    // Validation des domaines
    const formattedDomains = domains.map(domain => ({
      value: domain.trim().toLowerCase(),
      locked: false
    }));

    // Vérifier que tous les domaines sont valides et non utilisés
    console.log('Validation des domaines...');
    for (const domain of formattedDomains) {
      if (!isValidDomain(domain.value)) {
        return c.json(
          createErrorResponse('INVALID_DOMAIN', `Domaine invalide: ${domain.value}`),
          ERROR_CODES.INVALID_DOMAIN.httpStatus
        );
      }

      // Vérifier si le domaine existe déjà
      const existingSite = await Site.findOne({
        'domains.value': domain.value,
        'domains.locked': true
      });

      if (existingSite) {
        return c.json(
          createErrorResponse('DOMAIN_ALREADY_EXISTS', `Le domaine ${domain.value} est déjà utilisé`),
          ERROR_CODES.DOMAIN_ALREADY_EXISTS?.httpStatus || 409
        );
      }
    }

    // Vérifier que le nom du site est unique pour cet utilisateur
    console.log('Vérification de l\'unicité du nom du site...');
    const existingSite = await Site.findOne({ userId, siteName });
    console.log('Résultat de la recherche de doublons:', existingSite ? 'Site existant trouvé' : 'Aucun doublon');

    // Créer le site avec un identifiant unique (suffixe seulement)
    const rawApiKey = crypto.randomUUID();
    console.log('Génération de la clé API publique (suffixe):', rawApiKey);
    const site = new Site({
      userId,
      siteName,
      domains: formattedDomains,
      siteType,
      // On stocke uniquement le suffixe en base, le préfixe PUBLIC_API_KEY_PREFIX reste côté config
      apiKey: rawApiKey
    });

    // Sauvegarder en base de données
    const savedSite = await site.save();
    console.log('Site enregistré avec succès:', site.id);

    // Recalculer le nombre de sites après création (source unique: collection Site)
    const newSiteCount = await Site.countDocuments({ userId });

    // Mettre à jour les custom claims Firebase avec un message sur le site créé
    try {
      const userRecord = await adminAuth.getUser(userId);
      const claims = userRecord.customClaims || {};
      const msg = `success.Site "${siteName}" créé le ${savedSite.createdAt.toISOString()}`;

      // Empiler les messages dans un tableau msgs pour conserver l'historique récent
      let msgs = Array.isArray(claims.msgs) ? [...claims.msgs] : [];
      msgs.push(msg);
      // Limiter la taille de l'historique pour respecter la limite des custom claims
      const MAX_MSGS = 20;
      if (msgs.length > MAX_MSGS) {
        msgs = msgs.slice(-MAX_MSGS);
      }

      const newClaims = {
        ...claims,
        pl: userDoc.pl,
        st: 'active',
        maxSites: userDoc.maxSites,
        siteCount: newSiteCount,
        msg,   // dernier message pour compatibilité
        msgs   // historique récent
      };

      await adminAuth.setCustomUserClaims(userId, newClaims);
      console.log('Custom claims mis à jour après création de site pour l\'utilisateur:', userId, newClaims);
    } catch (claimError) {
      console.error('Erreur lors de la mise à jour des custom claims après création de site:', claimError);
    }

    // Réponse réussie - suffixe de la clé API + demande de rechargement du token côté frontend
    const responseData = { data: rawApiKey, token: 'reload' };
    console.log('Réponse envoyée au client:', JSON.stringify(responseData, null, 2));
    return c.json(responseData);

  } catch (error) {
    console.error('=== ERREUR LORS DE LA CRÉATION DU SITE ===');
    console.error('Erreur complète:', error);
    console.error('Stack trace:', error.stack);
    
    // Gestion des erreurs de validation Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return c.json(
        createErrorResponse('INVALID_INPUT', messages.join(', ')),
        ERROR_CODES.INVALID_INPUT.httpStatus
      );
    }
    
    // Erreur de clé dupliquée (siteName déjà utilisé)
    if (error.code === 11000) {
      return c.json(
        createErrorResponse('SITE_NAME_EXISTS'),
        ERROR_CODES.SITE_NAME_EXISTS.httpStatus
      );
    }
    
    // Erreur générique
    return c.json(
      createErrorResponse('SERVER_ERROR', error.message),
      ERROR_CODES.SERVER_ERROR.httpStatus
    );
  }
});

// Fonction utilitaire pour valider un domaine
function isValidDomain(domain) {
  if (!domain) return false;
  if (/^https?:\/\//i.test(domain) || /\//.test(domain)) return false;
  if (!/^[a-z]/.test(domain)) return false;
  if (/^localhost(?:\:\d{1,5})?$/.test(domain)) return true;
  const domainRe = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\:\d{1,5})?$/;
  return domainRe.test(domain);
}

export default router;
