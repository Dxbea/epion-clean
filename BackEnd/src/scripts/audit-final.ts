import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("📊 FINAL DATA INGESTION AUDIT");
    console.log("=============================\n");

    const total = await prisma.source.count();

    // 1. Coverage by Provider
    const sources = await prisma.source.findMany(); // Fetch all to check metadata

    let hasAllSides = 0; // usually checked via biasRating field or specific id/url pattern?
    // Actually AllSides usually sets 'politicalBias' directly. 
    // Let's assume non-null biasScore implies SOME rating.
    // But specifically 'allSides' ID? 
    // We merged them. Let's check metadata "importedFrom"? or specific fields?
    // Our schema doesn't strictly separate them.
    // But we know:
    // - MBFC sets 'mbfcRating' (if we had that field? No, we used generic fields).
    // - Ad Fontes set metadata.importedFrom = 'AdFontes'.
    // - Wikipedia sets metadata.wikipedia.
    // - MBFC ingestion likely set metadata too? Or just bias/reliability.

    // Let's check metadata keys
    let countAdFontes = 0;
    let countWikipedia = 0;
    let countMBFC = 0; // Inferred?
    let countReliabilitySet = 0;
    let countBiasSet = 0;

    // Reliability Distribution
    const relDist = { HIGH: 0, MIXED: 0, LOW: 0, PROPAGANDA: 0, UNKNOWN: 0 };

    for (const s of sources) {
        const meta = s.metadata as any || {};

        if (meta.importedFrom === 'AdFontes' || (meta.adFontesData)) countAdFontes++;
        if (meta.wikipedia) countWikipedia++;
        // MBFC was earlier. Did we tag it?
        // In 'consensus-ingestion.ts', we might not have tagged 'importedFrom' explicitly for ALL?
        // But we can check if it has a specific pattern or if we check the 'slug' field if it exists?
        // Let's check if it has 'mbfc_url' or similiar in metadata?
        // The audit-mbfc script from before checked for 'u' field?
        // Let's assume if it has 'credibility' or 'traffic' in metadata it's MBFC.
        if (meta.c || meta.P || meta.u) countMBFC++;

        if (s.reliability && s.reliability !== 'UNKNOWN') countReliabilitySet++;
        if (s.biasScore !== 0) countBiasSet++; // roughly

        if (relDist[s.reliability]) relDist[s.reliability]++;
    }

    console.log(`Totals: ${total} Sources`);
    console.log(`\n--- Sources Breakdown ---`);
    console.log(`🦅 Ad Fontes (Manual): ${countAdFontes}`);
    console.log(`🦜 Wikipedia (Scraped): ${countWikipedia}`);
    console.log(`🗳️ MBFC (Crowe V3):    ${countMBFC} (approx)`);

    console.log(`\n--- Data Richness ---`);
    console.log(`✅ Reliability Rated: ${countReliabilitySet} (${((countReliabilitySet / total) * 100).toFixed(1)}%)`);
    console.log(`⚖️ Bias Rated:        ${countBiasSet} (${((countBiasSet / total) * 100).toFixed(1)}%)`);

    console.log(`\n--- Reliability Distribution ---`);
    console.table(relDist);

    // Overlap Check (Consensus)
    // How many have >1 source?
    let overlap2 = 0;
    let overlap3 = 0;

    for (const s of sources) {
        let points = 0;
        const meta = s.metadata as any || {};
        if (meta.importedFrom === 'AdFontes') points++;
        else if (meta.wikipedia) points++; // Simplification: overlap logic is complex if we merged sources
        // Actually, a source can have BOTH Wikipedia AND AdFontes?
        // Our Ad Fontes script updated EXISTING sources if domain matched.
        // Wikipedia updated EXISTING.

        let sourcesCount = 0;
        if (meta.adFontesData) sourcesCount++;
        if (meta.wikipedia) sourcesCount++;
        if (meta.c || meta.u) sourcesCount++; // MBFC
        // We assume base was AllSides?

        if (sourcesCount >= 2) overlap2++;
        if (sourcesCount >= 3) overlap3++;
    }

    console.log(`\n--- Consensus / Usage ---`);
    console.log(`SOURCES with 2+ Data Points: ${overlap2}`);
    console.log(`SOURCES with 3+ Data Points: ${overlap3}`);

}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
