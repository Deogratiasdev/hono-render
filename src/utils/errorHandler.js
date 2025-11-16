/**
 * Codes d'erreur et messages associés
 * Format: CODE: { httpStatus: number, message: string }
 */
const ERROR_CODES = {
  // Erreurs de validation (400)
  INVALID_INPUT: { httpStatus: 400, message: 'Données d\'entrée invalides' },
  INVALID_DOMAIN: { httpStatus: 400, message: 'Format de domaine invalide' },
  INVALID_SITE_TYPE: { httpStatus: 400, message: 'Type de site non valide' },
  SITE_NAME_TOO_LONG: { httpStatus: 400, message: 'Le nom du site ne doit pas dépasser 15 caractères' },
  MISSING_FIELDS: { httpStatus: 400, message: 'Champs obligatoires manquants' },
  
  // Conflits (409)
  SITE_NAME_EXISTS: { httpStatus: 409, message: 'Un site avec ce nom existe déjà' },
  DOMAIN_ALREADY_EXISTS: { httpStatus: 409, message: 'Ce domaine est déjà utilisé' },
  SITE_QUOTA_EXCEEDED: { httpStatus: 403, message: 'Quota de sites atteint pour ce compte' },
  
  // Erreurs serveur (500)
  SERVER_ERROR: { httpStatus: 500, message: 'Erreur serveur interne' },
  
  // Erreurs d'authentification (401/403)
  UNAUTHORIZED: { httpStatus: 401, message: 'Non autorisé' },
  FORBIDDEN: { httpStatus: 403, message: 'Accès refusé' }
};

/**
 * Crée une réponse d'erreur standardisée
 * @param {string} code - Code d'erreur (ex: 'INVALID_INPUT')
 * @param {string} [details] - Détails supplémentaires sur l'erreur
 * @returns {Object} Réponse d'erreur formatée
 */
function createErrorResponse(code, details = '') {
  const errorInfo = ERROR_CODES[code] || ERROR_CODES.SERVER_ERROR;
  
  return {
    success: false,
    error: {
      code,
      message: errorInfo.message,
      details: details || undefined
    }
  };
}

/**
 * Middleware pour gérer les erreurs
 */
function errorHandler(error, c) {
  console.error('Erreur API:', error);
  
  // Erreurs de validation Mongoose
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    return c.json(
      createErrorResponse('INVALID_INPUT', messages.join(', ')),
      ERROR_CODES.INVALID_INPUT.httpStatus
    );
  }
  
  // Erreur de clé dupliquée
  if (error.code === 11000) {
    return c.json(
      createErrorResponse('SITE_NAME_EXISTS'),
      ERROR_CODES.SITE_NAME_EXISTS.httpStatus
    );
  }
  
  // Erreur personnalisée avec code
  if (error.code && ERROR_CODES[error.code]) {
    const code = error.code;
    return c.json(
      createErrorResponse(code, error.details),
      ERROR_CODES[code].httpStatus
    );
  }
  
  // Erreur générique
  return c.json(
    createErrorResponse('SERVER_ERROR', error.message),
    ERROR_CODES.SERVER_ERROR.httpStatus
  );
}

export { ERROR_CODES, createErrorResponse, errorHandler };
