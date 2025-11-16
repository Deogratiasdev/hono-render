import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const siteSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  siteName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 15
  },
  domains: [{
    value: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    locked: {
      type: Boolean,
      default: false
    }
  }],
  siteType: {
    type: String,
    required: true,
    enum: ['formulaire', 'vitrine', 'reservation', 'landing', 'autres']
  },
  apiKey: {
    type: String,
    required: true,
    unique: true,
    default: () => `gratias_${uuidv4()}`
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index composé pour les recherches par utilisateur et nom de site
siteSchema.index({ userId: 1, siteName: 1 }, { unique: true });

// Validation des domaines avant sauvegarde
siteSchema.pre('save', function(next) {
  // S'assurer qu'il y a au moins un domaine
  if (this.domains.length === 0) {
    throw new Error('Au moins un domaine est requis');
  }
  
  // Valider chaque domaine
  this.domains.forEach(domain => {
    if (!isValidDomain(domain.value)) {
      throw new Error(`Domaine invalide: ${domain.value}`);
    }
  });
  
  next();
});

// Fonction de validation de domaine
function isValidDomain(domain) {
  if (!domain) return false;
  if (/^https?:\/\//i.test(domain) || /\//.test(domain)) return false;
  if (!/^[a-z]/.test(domain)) return false;
  if (/^localhost(?:\:\d{1,5})?$/.test(domain)) return true;
  const domainRe = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\:\d{1,5})?$/;
  return domainRe.test(domain);
}

const Site = mongoose.model('Site', siteSchema);

export default Site;
