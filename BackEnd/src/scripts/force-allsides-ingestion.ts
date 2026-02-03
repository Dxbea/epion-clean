import { PrismaClient, PoliticalBias, Reliability } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// INITIALISATION
const prisma = new PrismaClient();

// 1. DÉFINITION DU MAPPING (Gère minuscules, majuscules, tirets)
// On normalise tout en minuscules pour être sûr que ça matche.
const BIAS_MAPPING: Record<string, { bias: PoliticalBias, score: number }> = {
    "left": { bias: "LEFT", score: -60 },
    "lean left": { bias: "CENTER_LEFT", score: -30 },
    "left-center": { bias: "CENTER_LEFT", score: -30 },
    "center": { bias: "CENTER", score: 0 },
    "lean right": { bias: "CENTER_RIGHT", score: 30 },
    "right-center": { bias: "CENTER_RIGHT", score: 30 },
    "right": { bias: "RIGHT", score: 60 },
    "mixed": { bias: "CENTER", score: 0 }, // Souvent utilisé pour "Mixed"
};

async function main() {
    console.log("🚀 Démarrage de l'ingestion FORCÉE...");

    // 2. CHARGEMENT DU JSON
    // On essaie de trouver le fichier JSON à plusieurs endroits possibles
    const possiblePaths = [
        path.join(process.cwd(), 'src/lib/data/allsides-data.json'),
        path.join(process.cwd(), 'src/data/allsides-data.json')
    ];

    let rawData: any[] = [];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            console.log(`✅ Fichier trouvé : ${p}`);
            const content = fs.readFileSync(p, 'utf-8');
            rawData = JSON.parse(content);
            break;
        }
    }

    if (rawData.length === 0) {
        console.error("❌ ERREUR : Impossible de trouver 'allsides-data.json'. Vérifie qu'il est bien dans src/lib/data/");
        return;
    }

    console.log(`📦 ${rawData.length} entrées trouvées dans le JSON.`);

    let successCount = 0;
    let errorCount = 0;

    // 3. BOUCLE D'INSERTION
    for (const item of rawData) {
        try {
            // Nettoyage du domaine (enlève https, www, slash final)
            let domain = item.url || item.domain;
            if (!domain) continue;
            domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();

            // Nettoyage du biais (tout en minuscule pour matcher le MAPPING)
            // JSON keys: rating, news_source
            const rawRating = (item.rating || item.bias_rating || "").toLowerCase().trim();
            const mapped = BIAS_MAPPING[rawRating];

            if (!mapped) {
                // console.warn(`⚠️ Biais inconnu ignoré : "${rawRating}" pour ${domain}`);
                continue;
            }

            // UPSERT (Force l'écriture)
            await prisma.source.upsert({
                where: { domain: domain },
                update: {
                    politicalBias: mapped.bias,
                    biasScore: mapped.score,
                    // On ne touche pas à la reliability si elle existe déjà, sinon HIGH par défaut pour AllSides
                    metadata: { importedFrom: "AllSides", originalRating: rawRating }
                },
                create: {
                    domain: domain,
                    name: item.news_source || item.name || domain,
                    politicalBias: mapped.bias,
                    biasScore: mapped.score,
                    reliability: Reliability.HIGH, // AllSides liste généralement des médias établis
                    trustScore: 50,
                    metadata: { importedFrom: "AllSides", originalRating: rawRating }
                }
            });

            process.stdout.write("."); // Petit point pour montrer que ça avance
            successCount++;

        } catch (e: any) {
            console.error(`\n❌ Erreur sur ${item.name}: ${e.message}`);
            errorCount++;
        }
    }

    console.log("\n\n🏁 TERMINÉ !");
    console.log(`✅ Succès : ${successCount}`);
    console.log(`❌ Echecs : ${errorCount}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());