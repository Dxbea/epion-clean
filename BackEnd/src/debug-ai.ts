import { tavily } from '@tavily/core';
import dotenv from 'dotenv';
import path from 'path';
// 1. Charger le .env explicitement
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
async function testConnection() {
    const key = process.env.TAVILY_API_KEY;
    console.log('--- DIAGNOSTIC IA ---');
    console.log('1. Verification de la cle Tavily...');
    if (!key) {
        console.error('ERROR: No key found in process.env.TAVILY_API_KEY');
        console.log(' -> Verifie que le fichier .env est bien dans le dossier BackEnd.');
        return;
    }
    console.log(`Key detected: ${key.substring(0, 4)}...`);
    console.log('2. Tentative de connexion a Tavily...');
    try {
        const tvly = tavily({ apiKey: key });
        const response = await tvly.search('Say Hello World', {
            searchDepth: 'basic',
            maxResults: 2,
            includeRawContent: 'text',
        });
        console.log('SUCCESS! Response received:');
        console.log(JSON.stringify(response, null, 2));
        console.log('--- END OF TEST ---');
    } catch (error) {
        console.error('REQUEST FAILED');
        console.error(error);
    }
}
testConnection();
