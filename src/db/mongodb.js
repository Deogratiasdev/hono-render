import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    console.log('🔌 Tentative de connexion à MongoDB...');
    console.log('🔗 URI:', process.env.MONGODB_URI ? '✅ Défini' : '❌ Non défini');
    
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI non défini dans les variables d\'environnement');
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // 5 secondes de timeout
    });

    console.log(`✅ MongoDB connecté avec succès: ${conn.connection.host}`);
    console.log(`📊 Base de données: ${conn.connection.name}`);
    
    // Gestion des événements de connexion
    mongoose.connection.on('connected', () => {
      console.log('🔗 Connecté à MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ Erreur de connexion MongoDB:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  Déconnecté de MongoDB');
    });

    return conn;
  } catch (error) {
    console.error('❌ Erreur de connexion à MongoDB:', error.message);
    console.error('💡 Vérifiez que :');
    console.error('1. Votre URI MongoDB est correcte');
    console.error('2. Votre cluster MongoDB est accessible depuis votre IP');
    console.error('3. Vos identifiants sont corrects');
    
    // Arrêt du processus avec un code d'erreur
    process.exit(1);
  }
};

export default connectDB;
