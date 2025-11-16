import admin from 'firebase-admin';
const { auth } = admin;

/**
 * Middleware pour vérifier les tokens Firebase JWT
 * Protège toutes les routes commençant par /user/
 */
export const verifyFirebaseToken = async (c, next) => {
  // Gestion des requêtes OPTIONS pour CORS
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400', // 24 heures
      },
    });
  }

  // Récupération du token d'authentification
  const authHeader = c.req.header('authorization');
  
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return c.json(
      { 
        success: false, 
        error: {
          code: 'missing_authorization_header',
          message: 'En-tête d\'autorisation manquant ou invalide. Utilisez le format: Bearer <token>'
        }
      }, 
      401,
      {
        'Access-Control-Allow-Origin': '*',
        'WWW-Authenticate': 'Bearer error="missing_token"',
      }
    );
  }

  const token = authHeader.split(' ')[1];

  // Log du token reçu (tronqué pour ne pas exposer le JWT complet)
  if (token) {
    const start = token.slice(0, 12);
    const end = token.slice(-12);
    console.log('🔑 Token Firebase reçu (longueur %d): %s...%s', token.length, start, end);
  }

  try {
    // Vérification du token Firebase
    const decodedToken = await auth().verifyIdToken(token, true);
    
    // Vérification que le compte est actif et vérifié
    if (decodedToken.disabled) {
      return c.json(
        { 
          success: false, 
          error: {
            code: 'account_disabled',
            message: 'Ce compte utilisateur a été désactivé'
          }
        },
        403,
        { 'Access-Control-Allow-Origin': '*' }
      );
    }

    // Ajout des informations utilisateur au contexte
    c.set('user', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      email_verified: decodedToken.email_verified || false,
      name: decodedToken.name,
      picture: decodedToken.picture,
      roles: decodedToken.roles || [],
      // Ajoutez d'autres champs utilisateur si nécessaire
    });

    // Passage au prochain middleware
    await next();
  } catch (error) {
    console.error('❌ Erreur de vérification du token Firebase:', {
      error: error.message,
      code: error.code,
      stack: error.stack
    });

    let status = 401;
    let errorCode = 'invalid_token';
    let errorMessage = 'Token invalide ou expiré';

    // Gestion des erreurs spécifiques
    switch (error.code) {
      case 'auth/id-token-expired':
        errorCode = 'token_expired';
        errorMessage = 'Le token a expiré. Veuillez vous reconnecter.';
        break;
      case 'auth/argument-error':
        errorCode = 'invalid_token_format';
        errorMessage = 'Format de token invalide';
        break;
      case 'auth/user-not-found':
        errorCode = 'user_not_found';
        errorMessage = 'Utilisateur non trouvé';
        status = 404;
        break;
      default:
        // Pour les autres erreurs, conserver le message d'erreur par défaut
        break;
    }

    return c.json(
      { 
        success: false, 
        error: {
          code: errorCode,
          message: errorMessage
        }
      },
      status,
      {
        'Access-Control-Allow-Origin': '*',
        'WWW-Authenticate': `Bearer error="${errorCode}"`,
      }
    );
  }
};
