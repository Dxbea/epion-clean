import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Exceptions manuelles pour les gros médias qui ne finissent pas en .com ou qui ont des noms bizarres
const EXCEPTIONS: Record<string, string> = {
    "bbc-news": "bbc.com",
    "npr": "npr.org",
    "the-guardian": "theguardian.com",
    "associated-press": "apnews.com",
    "reuters": "reuters.com",
    "abc-news": "abcnews.go.com",
    "gov-track": "govtrack.us",
    "white-house": "whitehouse.gov",
    "the-new-york-times": "nytimes.com",
    "usa-today": "usatoday.com",
    "cnn": "cnn.com",
    "fox-news": "foxnews.com",
    "nbc-news": "nbcnews.com",
    "cbs-news": "cbsnews.com",
    "washington-post": "washingtonpost.com",
    "the-wall-street-journal": "wsj.com",
    "politico": "politico.com",
    "the-hill": "thehill.com",
    "huffpost": "huffpost.com",
    "al-jazeera": "aljazeera.com",
    "bloomberg": "bloomberg.com",
    "national-review": "nationalreview.com",
    "the-daily-wire": "dailywire.com",
    "breitbart": "breitbart.com",
    "newsweek": "newsweek.com",
    "time-magazine": "time.com",
    "business-insider": "businessinsider.com",
    "vox": "vox.com",
    "vice": "vice.com",
    "buzzfeed-news": "buzzfeednews.com",
    "the-economist": "economist.com",
    "financial-times": "ft.com",
    "propublica": "propublica.org",
    "democracynow": "democracynow.org",
    "jacobin": "jacobin.com",
    "mother-jones": "motherjones.com",
    "the-intercept": "theintercept.com",
    "axios": "axios.com",
    "slate": "slate.com",
    "salon": "salon.com",
    "vanity-fair": "vanityfair.com",
    "the-new-yorker": "newyorker.com",
    "the-atlantic": "theatlantic.com",
    "rolling-stone": "rollingstone.com",
    "foreign-policy": "foreignpolicy.com",
    "foreign-affairs": "foreignaffairs.com",
    "scientific-american": "scientificamerican.com",
    "national-geographic": "nationalgeographic.com",
    "smithsonian-magazine": "smithsonianmag.com",
    "new-scientist": "newscientist.com",
    "techcrunch": "techcrunch.com",
    "the-verge": "theverge.com",
    "wired": "wired.com",
    "arstechnica": "arstechnica.com",
    "engadget": "engadget.com",
    "gizmodo": "gizmodo.com",
    "cnet": "cnet.com",
    "zdnet": "zdnet.com",
    "mashable": "mashable.com",
    "pc-magazine": "pcmag.com",
    "ign": "ign.com",
    "gamespot": "gamespot.com",
    "polygon": "polygon.com",
    "kotaku": "kotaku.com",
    "espn": "espn.com",
    "sports-illustrated": "si.com",
    "bleacher-report": "bleacherreport.com",
    "cbssports": "cbssports.com",
    "nbc-sports": "nbcsports.com",
    "fox-sports": "foxsports.com",
    "barstool-sports": "barstoolsports.com",
    "the-athletic": "theathletic.com",
    "christianity-today": "christianitytoday.com",
    "christian-science-monitor": "csmonitor.com",
    "national-catholic-register": "ncregister.com",
    "catholic-news-agency": "catholicnewsagency.com",
    "jewish-telegraphic-agency": "jta.org",
    "times-of-israel": "timesofisrael.com",
    "jpost": "jpost.com",
    "haaretz": "haaretz.com",
};

async function main() {
    console.log("🧹 Démarrage du nettoyage des domaines AllSides...");

    // 1. Récupérer les entrées "sales"
    const dirtySources = await prisma.source.findMany({
        where: {
            domain: { contains: 'allsides.com' }
        }
    });

    console.log(`📋 ${dirtySources.length} sources à nettoyer.`);

    let updated = 0;
    let deleted = 0;

    for (const source of dirtySources) {
        const oldDomain = source.domain;

        // Extraction du slug: "[allsides.com/news-source/the-new-york-times](https://allsides.com/news-source/the-new-york-times)" -> "the-new-york-times"
        // Handle cases where there might be query params or other junk? Usually not in this dataset.
        const parts = oldDomain.split('/');
        let slug = parts[parts.length - 1];

        // Si l'URL finit par un slash, on prend l'avant dernier
        if (!slug) slug = parts[parts.length - 2];

        if (!slug) {
            console.warn(`⚠️ Slug introuvable pour ${oldDomain}`);
            continue;
        }

        // Nettoyage basique
        let newDomain = "";

        // Est-ce une exception connue ?
        if (EXCEPTIONS[slug]) {
            newDomain = EXCEPTIONS[slug];
        } else {
            // Sinon, on tente la méthode générique : on enlève les tirets et on ajoute .com
            // "new-york-post" -> "newyorkpost.com"
            newDomain = slug.replace(/-/g, '') + ".com";
        }

        try {
            // On vérifie si la destination existe déjà
            const existing = await prisma.source.findUnique({ where: { domain: newDomain } });

            if (existing) {
                // MERGE STRATEGY: Update the existing record with AllSides data IF it's missing, then delete the dirty one
                // This prevents data loss if clean record has no rating
                const dataToUpdate: any = {};
                let shouldUpdate = false;

                if (!existing.allSidesRating && source.allSidesRating) {
                    dataToUpdate.allSidesRating = source.allSidesRating;
                    shouldUpdate = true;
                }
                if (!existing.politicalBias || existing.politicalBias === 'UNKNOWN') {
                    if (source.politicalBias && source.politicalBias !== 'UNKNOWN') {
                        dataToUpdate.politicalBias = source.politicalBias;
                        dataToUpdate.biasScore = source.biasScore;
                        shouldUpdate = true;
                    }
                }

                if (shouldUpdate) {
                    console.log(`🔄 Merging data from ${slug} into existing ${newDomain}`);
                    await prisma.source.update({
                        where: { id: existing.id },
                        data: dataToUpdate
                    });
                } else {
                    console.log(`⚠️ Doublon détecté pour ${newDomain} (déjà complet).`);
                }

                console.log(`🗑️ Suppression de la version temporaire AllSides (${slug})`);
                await prisma.source.delete({ where: { id: source.id } });
                deleted++;

            } else {
                // Update simple: rename the domain
                await prisma.source.update({
                    where: { id: source.id },
                    data: { domain: newDomain }
                });
                updated++;
                process.stdout.write(".");
            }
        } catch (e: any) {
            console.error(`❌ Erreur sur ${slug}:`, e.message);
        }
    }

    console.log(`\n✨ Terminé !`);
    console.log(`   Renommés : ${updated}`);
    console.log(`   Fusionnés/Supprimés : ${deleted}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
