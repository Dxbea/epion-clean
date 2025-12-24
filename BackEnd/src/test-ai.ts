// Fichier: BackEnd/src/test-ai.ts
import { callPerplexity } from './lib/perplexity'; // Chemin relatif corrigé si le fichier est dans src/

console.log('--- TEST START ---');

// On lance un test avec un faux message
callPerplexity([{ role: 'user', content: 'Hello' }], 'sonar')
    .then(res => {
        console.log('✅ Succès !');
        // On affiche le contenu du message reçu
        console.log('Réponse :', res.choices[0].message.content);
    })
    .catch(err => {
        console.error('❌ Erreur :', err);
    });