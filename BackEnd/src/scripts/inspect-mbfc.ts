import axios from 'axios';
import { parse } from 'csv-parse/sync';

const MBFC_CSV_URL = 'https://raw.githubusercontent.com/idiap/Factual-Reporting-and-Political-Bias-Web-Interactions/main/data/mbfc_raw.csv';

async function checkMBFCStructure() {
    console.log('📡 Fetching MBFC CSV sample...');
    try {
        const response = await axios.get(MBFC_CSV_URL, {
            responseType: 'text',
            headers: { 'User-Agent': 'Epion-Check/1.0' }
        });

        const records = parse(response.data, {
            columns: true,
            to: 5 // Get first 5 rows
        }) as Record<string, any>[];

        console.log("📋 First record keys:", Object.keys(records[0]));
        const r = records[0];
        console.log(`VALUES -> Bias: "${r.bias}", Factual: "${r.factual_reporting}", Cred: "${r.mbfc_credibility_rating}"`);

    } catch (e: any) {
        console.error("❌ Error:", e.message);
    }
}

checkMBFCStructure();
