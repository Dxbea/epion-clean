import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// 1. Charger le .env explicitement
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testConnection() {
    const key = process.env.PERPLEXITY_API_KEY;

    console.log('--- DIAGNOSTIC IA ---');
    console.log('1. Vérification de la clé...');

    if (!key) {
        console.error('❌ ERREUR: Aucune clé trouvée dans process.env.PERPLEXITY_API_KEY');
        console.log(' -> Vérifie que le fichier .env est bien dans le dossier BackEnd.');
        return;
    }

    // Affiche les 4 premiers caractères pour vérifier (sans tout révéler)
    console.log(`✅ Clé détectée: ${key.substring(0, 4)}...`);

    console.log('2. Tentative de connexion à Perplexity...');

    try {
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: 'sonar-pro',
                messages: [{ role: 'user', content: 'Say Hello World' }]
            },
            {
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ SUCCÈS ! Réponse reçue :');
        console.log('✅ SUCCÈS ! Réponse reçue :');
        console.log(JSON.stringify(response.data, null, 2));
        console.log('--- FIN DU TEST ---');
    } catch (error: any) {
        console.error('❌ ÉCHEC DE LA REQUÊTE');
        if (error.response) {
            console.error(`Status Code: ${error.response.status}`);
            console.error('Message API:', JSON.stringify(error.response.data, null, 2));

            if (error.response.status === 401) console.log('👉 Cause probable : Clé incorrecte.');
            if (error.response.status === 402) console.log('👉 Cause probable : Pas de crédits (Solde épuisé ou à 0$).');
        } else {
            console.error('Erreur réseau :', error.message);
        }
    }
}

testConnection();
