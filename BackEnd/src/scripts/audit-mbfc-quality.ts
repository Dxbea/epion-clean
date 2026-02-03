import fs from 'fs';
import path from 'path';

const LOCAL_MBFC_PATH = path.join(process.cwd(), 'src/lib/data/mbfc-data.json');

async function main() {
    console.log("🕵️ Auditing MBFC (Crowe V3) Dataset...");

    if (!fs.existsSync(LOCAL_MBFC_PATH)) {
        console.error("❌ Stats file missing.");
        return;
    }

    const rawData = JSON.parse(fs.readFileSync(LOCAL_MBFC_PATH, 'utf-8'));

    // 1. Structure Audit
    console.log(`\n--- 1. Metadata Availability (Q3) ---`);
    console.log(`Version: ${rawData.version}`);
    console.log(`Date: ${rawData.date}`);
    // Check key definitions if available
    // Crowe usually documents keys in the repo, but let's infer from data

    const sources = Object.values(rawData.sources) as any[];
    console.log(`Total Sources: ${sources.length}`);

    // analyze first 100 to map keys usage
    const keysUsage: Record<string, number> = {};
    sources.forEach(s => {
        Object.keys(s).forEach(k => {
            keysUsage[k] = (keysUsage[k] || 0) + 1;
        });
    });

    console.log("Field Frequency (Top fields):");
    Object.entries(keysUsage)
        .sort((a, b) => b[1] - a[1]) // Sort by freq
        .forEach(([k, v]) => console.log(`   - ${k}: ${v} (${Math.round(v / sources.length * 100)}%)`));

    // 2. Data Conformity & Links (Q2, Q4)
    console.log(`\n--- 2. Conformity & Justification Links ---`);
    const hasUrl = sources.filter(s => s.u && s.u.includes('mediabiasfactcheck.com')).length;
    console.log(`Sources with valid MBFC URLs (field 'u'): ${hasUrl} (${Math.round(hasUrl / sources.length * 100)}%)`);
    console.log(`   -> Crucial for future scraping of "Justifications" (Q4)`);

    // 3. Domain Quality (Q1)
    console.log(`\n--- 3. URL/Domain Quality Audit ---`);
    let validDomains = 0;
    let missingDomains = 0;
    let weirdDomains = 0;

    const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    const badSamples: string[] = [];

    sources.forEach(s => {
        if (!s.d) {
            missingDomains++;
        } else {
            const domain = s.d.trim().toLowerCase();
            if (domainRegex.test(domain)) {
                validDomains++;
            } else {
                weirdDomains++;
                if (badSamples.length < 5) badSamples.push(domain);
            }
        }
    });

    const report = `
AUDIT REPORT
Total Sources: ${sources.length}
Valid Domains: ${validDomains}
Missing Domains: ${missingDomains}
Weird Domains: ${weirdDomains}

Weird Samples (First 20):
${badSamples.slice(0, 20).join('\n')}

Metadata:
- Has URL (u): ${hasUrl}
`;

    fs.writeFileSync('audit_report.txt', report);
    console.log("✅ Report written to audit_report.txt");
}

main();
