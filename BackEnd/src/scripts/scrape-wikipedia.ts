import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient, Reliability } from '@prisma/client';

const prisma = new PrismaClient();
const WIKI_URL = 'https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources';

async function main() {
    console.log("🦜 Scraping & Enriching from Wikipedia Perennial Sources...");

    // 1. Load DB Sources
    const dbSources = await prisma.source.findMany();
    console.log(`📚 Loaded ${dbSources.length} sources from DB.`);

    // 2. Fetch Wikipedia
    const { data } = await axios.get(WIKI_URL, { headers: { 'User-Agent': 'Epion-Bot/1.0' } });
    const $ = cheerio.load(data);

    // Find Largest Table
    let table = $('.wikitable').first();
    let maxRows = 0;
    $('.wikitable').each((i, el) => {
        const rowCount = $(el).find('tr').length;
        if (rowCount > maxRows) {
            maxRows = rowCount;
            table = $(el);
        }
    });

    const rows = table.find('tr');
    console.log(`Found largest table with ${rows.length} rows.`);


    let updatedCount = 0;
    let skippedCount = 0;
    let startMatchLog = true;

    for (let i = 1; i < rows.length; i++) {
        const row = $(rows[i]);
        const cols = row.find('td');
        if (cols.length < 2) continue;

        // Extract Wiki Name
        let wikiName = $(cols[0]).text().trim();
        // Remove citations [1]
        wikiName = wikiName.replace(/\[.*?\]/g, '').trim();

        const statusText = $(cols[1]).text().trim().toLowerCase();

        // Match Logic: Normalize
        // "CNN (Web)" -> "cnnweb"
        // "Fox News" -> "foxnews"
        // "Cnn.com" -> "cnn" (remove .com)
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace('com', '');

        const nWiki = normalize(wikiName);
        if (nWiki.length < 2) { skippedCount++; continue; }

        if (nWiki === 'cnn' || nWiki === 'foxnews') {
            console.log(`DEBUG: Found Wiki Entry: ${wikiName} (norm: ${nWiki})`);
        }

        const match = dbSources.find(s => {
            const nDB = normalize(s.name);
            const nDomain = normalize(s.domain || '');

            // Check Name Match
            if (nDB.length > 2 && (nDB.includes(nWiki) || nWiki.includes(nDB))) return true;
            // Check Domain Match
            if (nDomain.length > 2 && (nDomain.includes(nWiki) || nWiki.includes(nDomain))) return true;

            return false;
        });

        if (!match) {
            if (nWiki === 'cnn' || nWiki === 'foxnews') console.log("DEBUG: CNN/Fox NOT MATCHED!");
            skippedCount++;
            continue;
        } else {
            if (startMatchLog && (nWiki === 'cnn' || nWiki === 'foxnews')) {
                console.log(`DEBUG: Matched ${wikiName} -> DB: ${match.name} (ID: ${match.id})`);
            }
        }

        // Ratings
        let reliability = match.reliability;
        let wikiStatus = 'Unknown';
        let wikiScore = 0;

        if (statusText.includes('generally reliable')) {
            wikiStatus = 'Reliable';
            wikiScore = 90;
            if (reliability === Reliability.UNKNOWN) reliability = Reliability.HIGH;
        } else if (statusText.includes('no consensus')) {
            wikiStatus = 'No Consensus';
            wikiScore = 50;
            if (reliability === Reliability.UNKNOWN) reliability = Reliability.MIXED;
        } else if (statusText.includes('generally unreliable')) {
            wikiStatus = 'Unreliable';
            wikiScore = 20;
            if (reliability === Reliability.UNKNOWN) reliability = Reliability.LOW;
        } else if (statusText.includes('deprecated') || statusText.includes('blacklisted')) {
            wikiStatus = 'Blacklisted';
            wikiScore = 0;
            if (reliability === Reliability.UNKNOWN) reliability = Reliability.PROPAGANDA;
        } else {
            continue;
        }

        // Update DB
        const currentMeta = match.metadata as any || {};
        const newMeta = {
            ...currentMeta,
            wikipedia: {
                status: wikiStatus,
                score: wikiScore,
                lastScraped: new Date().toISOString()
            }
        };

        await prisma.source.update({
            where: { id: match.id },
            data: {
                reliability: reliability,
                metadata: newMeta,
            }
        });

        updatedCount++;
        if (updatedCount % 10 === 0) process.stdout.write('.');
    }

    console.log(`\n✅ Finished. Updated/Enriched: ${updatedCount}. Skipped: ${skippedCount}.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
