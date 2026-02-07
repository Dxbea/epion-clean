import 'dotenv/config';
import { PrismaClient, PoliticalBias, Reliability } from '@prisma/client';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const ALLSIDES_CSV_URL = 'https://raw.githubusercontent.com/favstats/AllSideR/master/data/allsides_data.csv';
const LOCAL_JSON_PATH = path.join(process.cwd(), 'src/lib/data/allsides-data.json');

// 1. DÉFINITION DU MAPPING (Gère minuscules, majuscules, tirets)
const BIAS_MAPPING: Record<string, { bias: PoliticalBias, score: number }> = {
    "left": { bias: PoliticalBias.LEFT, score: -60 },
    "lean left": { bias: PoliticalBias.CENTER_LEFT, score: -30 },
    "left-center": { bias: PoliticalBias.CENTER_LEFT, score: -30 },
    "center": { bias: PoliticalBias.CENTER, score: 0 },
    "lean right": { bias: PoliticalBias.CENTER_RIGHT, score: 30 },
    "right-center": { bias: PoliticalBias.CENTER_RIGHT, score: 30 },
    "right": { bias: PoliticalBias.RIGHT, score: 60 },
    "mixed": { bias: PoliticalBias.CENTER, score: 0 },
};

/**
 * Updates or creates the local JSON cache from the remote CSV.
 */
async function updateLocalData(): Promise<any[]> {
    console.log('📡 Updating local AllSides data from CSV...');
    try {
        const response = await axios.get(ALLSIDES_CSV_URL, {
            timeout: 30000,
            responseType: 'text',
            headers: { 'User-Agent': 'Epion-Consensus-Bot/1.0' }
        });

        const records = parse(response.data, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_quotes: true,
            relax_column_count: true
        });

        const dir = path.dirname(LOCAL_JSON_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(LOCAL_JSON_PATH, JSON.stringify(records, null, 2));
        console.log(`✅ Saved ${records.length} records to ${LOCAL_JSON_PATH}`);
        return records;

    } catch (error: any) {
        console.error('⚠️ Failed to download/update CSV:', error.message);
        return [];
    }
}

/**
 * Main ingestion function using sequential upserts for reliability.
 */
export async function ingestAllSidesData() {
    console.log("🚀 Starting AllSides Ingestion...");

    let rawData: any[] = [];

    // Try to load local JSON first
    if (fs.existsSync(LOCAL_JSON_PATH)) {
        console.log(`✅ Found local data at ${LOCAL_JSON_PATH}`);
        try {
            rawData = JSON.parse(fs.readFileSync(LOCAL_JSON_PATH, 'utf-8'));
        } catch (e) {
            console.error("❌ Local JSON corrupted, forcing update.");
        }
    }

    // If no local data or empty, try to fetch
    if (rawData.length === 0) {
        rawData = await updateLocalData();
    }

    if (rawData.length === 0) {
        console.error("❌ CRTICAL: No data available for ingestion.");
        return;
    }

    console.log(`📦 Processing ${rawData.length} entries...`);

    let successCount = 0;
    let errorCount = 0;

    for (const item of rawData) {
        try {
            // Nettoyage du domaine
            let domain = item.url || item.domain;
            if (!domain) continue;
            domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();

            // Nettoyage du biais
            // JSON keys from CSV parse: rating / news_source. 
            // Fallbacks handled for different source formats.
            const rawRating = (item.rating || item.bias_rating || "").toLowerCase().trim();
            const mapped = BIAS_MAPPING[rawRating];

            if (!mapped) {
                // console.warn(`⚠️ Unknown bias: "${rawRating}" for ${domain}`);
                continue;
            }

            // UPSERT (Sequential for reliability)
            await prisma.source.upsert({
                where: { domain: domain },
                update: {
                    politicalBias: mapped.bias,
                    biasScore: mapped.score,
                    allSidesRating: rawRating,
                    metadata: { importedFrom: "AllSides", originalRating: rawRating }
                },
                create: {
                    domain: domain,
                    name: item.news_source || item.name || domain,
                    politicalBias: mapped.bias,
                    biasScore: mapped.score,
                    reliability: Reliability.HIGH,
                    trustScore: 50,
                    allSidesRating: rawRating,
                    metadata: { importedFrom: "AllSides", originalRating: rawRating }
                }
            });

            process.stdout.write(".");
            successCount++;

        } catch (e: any) {
            console.error(`\n❌ Error on ${item.name || 'unknown'}: ${e.message}`);
            errorCount++;
        }
    }

    console.log("\n\n🏁 INGESTION COMPLETE");
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
}

const MBFC_JSON_URL = 'https://raw.githubusercontent.com/drmikecrowe/mbfcext/main/docs/v3/combined.json';
const LOCAL_MBFC_PATH = path.join(process.cwd(), 'src/lib/data/mbfc-data.json');

// DRMIKECROWE MAPPINGS (b = bias)
const MBFC_BIAS_MAP: Record<string, { bias: PoliticalBias, score: number }> = {
    "L": { bias: PoliticalBias.LEFT, score: -60 },
    "LC": { bias: PoliticalBias.CENTER_LEFT, score: -30 },
    "C": { bias: PoliticalBias.CENTER, score: 0 },
    "RC": { bias: PoliticalBias.CENTER_RIGHT, score: 30 },
    "R": { bias: PoliticalBias.RIGHT, score: 60 },
    "EL": { bias: PoliticalBias.EXTREME_LEFT, score: -90 },
    "ER": { bias: PoliticalBias.EXTREME_RIGHT, score: 90 },
    "S": { bias: PoliticalBias.SATIRE, score: 0 },
    "PS": { bias: PoliticalBias.CENTER, score: 0 }, // Pro-Science often center
};

// DRMIKECROWE MAPPINGS (r = reliability)
const MBFC_RELIABILITY_MAP: Record<string, Reliability> = {
    "VH": Reliability.HIGH,
    "H": Reliability.HIGH,
    "MF": Reliability.HIGH, // Mostly Factual
    "M": Reliability.MIXED,
    "L": Reliability.LOW,
    "VL": Reliability.LOW,
};

/**
 * Downloads and caches MBFC data (JSON).
 */
async function updateLocalMBFCData(): Promise<any> {
    console.log('📡 Updating local MBFC data from Crowe JSON...');
    try {
        const response = await axios.get(MBFC_JSON_URL, {
            timeout: 60000, // Large file
            headers: { 'User-Agent': 'Epion-Consensus-Bot/1.0' }
        });

        // Response is already JSON object
        const data = response.data;

        const dir = path.dirname(LOCAL_MBFC_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(LOCAL_MBFC_PATH, JSON.stringify(data, null, 2));
        console.log(`✅ Saved MBFC fields to ${LOCAL_MBFC_PATH}`);
        return data;

    } catch (error: any) {
        console.error('⚠️ Failed to download Crowe JSON:', error.message);
        return null;
    }
}

/**
 * Main ingestion function for MBFC with Consensus Logic
 */
export async function ingestMBFCData() {
    console.log("🚀 Starting MBFC Ingestion (Crowe V3) with Consensus Protocol...");

    let rawData: any = null;

    // Load or Fetch
    if (fs.existsSync(LOCAL_MBFC_PATH)) {
        console.log(`✅ Found local data at ${LOCAL_MBFC_PATH}`);
        try {
            rawData = JSON.parse(fs.readFileSync(LOCAL_MBFC_PATH, 'utf-8'));
        } catch (e) {
            rawData = await updateLocalMBFCData();
        }
    } else {
        rawData = await updateLocalMBFCData();
    }

    if (!rawData || !rawData.sources) {
        console.error("❌ CRTICAL: No MBFC data available (sources key missing).");
        return;
    }

    // Crowe V3: 'sources' is an object where key is a slug/hash and value is the data
    const sources = Object.values(rawData.sources) as any[];
    console.log(`📦 Processing ${sources.length} MBFC entries...`);

    let successCount = 0;
    let consensusCount = 0;
    let newCount = 0;
    let errorCount = 0;

    for (const item of sources) {
        try {
            // 1. Clean Domain (Crowe data has 'd' field for domain!)
            let domain = item.d || "";
            if (!domain) continue; // Skip if no domain

            domain = domain.toLowerCase().trim();

            // 2. Map Data
            // b = bias code
            const rawBias = (item.b || "").toUpperCase();
            // r = reliability code
            const rawRel = (item.r || "").toUpperCase();

            const biasMap = MBFC_BIAS_MAP[rawBias];
            const reliability = MBFC_RELIABILITY_MAP[rawRel] || Reliability.UNKNOWN;

            if (!biasMap) {
                // e.g. "FN" (Fake News) or other codes not mapped
                // console.warn(`Skipping unmapped bias: ${rawBias}`);
                continue;
            }

            // 3. Find Existing Source to CONSENSUS
            const existing = await prisma.source.findUnique({ where: { domain: domain } });

            let finalBias = biasMap.bias;
            let finalScore = biasMap.score;
            let isConsensus = false;

            if (existing) {
                // CONSENSUS CALCULATION
                // Only if existing has a real score (not 0 default) and comes from AllSides
                if (existing.allSidesRating && existing.biasScore !== 0) {
                    // Average the scores
                    // Example: AllSides (-60) + MBFC (-30) = -90 / 2 = -45
                    finalScore = Math.round((existing.biasScore + biasMap.score) / 2);

                    // Recalculate Enum based on corrected range
                    // Note: This logic duplicates getEnumFromScore, but sticking to inline for now to avoid dep imports issues
                    if (finalScore <= -75) finalBias = PoliticalBias.EXTREME_LEFT;
                    else if (finalScore <= -45) finalBias = PoliticalBias.LEFT;
                    else if (finalScore <= -15) finalBias = PoliticalBias.CENTER_LEFT;
                    else if (finalScore <= 15) finalBias = PoliticalBias.CENTER;
                    else if (finalScore <= 45) finalBias = PoliticalBias.CENTER_RIGHT;
                    else if (finalScore <= 75) finalBias = PoliticalBias.RIGHT;
                    else finalBias = PoliticalBias.EXTREME_RIGHT;

                    isConsensus = true;
                    consensusCount++;
                }
            } else {
                newCount++;
            }

            // 4. UPSERT
            await prisma.source.upsert({
                where: { domain: domain },
                update: {
                    mbfcRating: item.b, // Store raw code (e.g. "L")
                    // If CONSENSUS hit:
                    ...(existing && existing.allSidesRating ? {
                        biasScore: finalScore,
                        politicalBias: finalBias,
                        isConsensusVerified: true,
                        // Always update reliability from MBFC
                        reliability: reliability
                    } : {
                        // NO Consensus (just MBFC update or already MBFC)
                        biasScore: finalScore,
                        politicalBias: finalBias,
                        reliability: reliability
                    }),
                    metadata: {
                        ...(existing?.metadata as object || {}),
                        importedFrom: existing?.metadata ? "AllSides+MBFC" : "MBFC",
                        mbfcData: { code: rawBias, rel: rawRel, original: item }
                    }
                },
                create: {
                    domain: domain,
                    name: item.n || item.t || domain, // n=name, t=title
                    politicalBias: finalBias,
                    biasScore: finalScore,
                    reliability: reliability,
                    trustScore: 50,
                    mbfcRating: item.b,
                    isConsensusVerified: false,
                    metadata: { importedFrom: "MBFC", mbfcData: { code: rawBias, rel: rawRel, original: item } }
                }
            });

            process.stdout.write(".");
            successCount++;

        } catch (e: any) {
            errorCount++;
        }
    }

    console.log("\n\n🏁 MBFC INGESTION (Crowe V3) COMPLETE");
    console.log(`✅ Processed: ${successCount}`);
    console.log(`🤝 Consensus Updates: ${consensusCount}`);
    console.log(`✨ New Sources: ${newCount}`);
    console.log(`❌ Errors: ${errorCount}`);
}

// Allow direct execution
// Allow direct execution
if (require.main === module) {
    (async () => {
        // Uncomment to run AllSides first if needed
        // await ingestAllSidesData();
        await ingestMBFCData();
    })()
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}
