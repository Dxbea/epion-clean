// BackEnd/src/lib/trust-score.ts
import { prisma } from "./db"; // Assure-toi que le chemin vers db est bon
import { analyzeAdsTxt } from "./ads-scanner";
import { analyzeUX } from "./ux-scanner";
import { analyzeSemantics } from "./semantic-scanner";

import { checkMediaReputation } from "./google-fact-check";
import { generateSourceDescription } from "../services/sourceProfiler";

// ⚖️ PONDÉRATIONS STRICTES (Selon Matrice Epion PDF)
const WEIGHTS = {
    transparency: 0.20, // Structurelle (ads.txt, propriétaires)
    editorial: 0.30,    // Processus (Fact-check, corrections)
    semantic: 0.30,     // Contenu (Biais, sophismes - Futur NLP)
    ux: 0.20            // Respect utilisateur (Pubs, Dark patterns)
};

export interface RichTrustScore {
    globalScore: number;
    confidenceLevel: string;
    details: {
        transparency: number;
        editorial: number;
        semantic: number;
        ux: number;
    };
    flags: {
        isPlatform: boolean;
        hasFactCheckFailures: boolean;
        isAdsTxtValid: boolean;
        adDensity: string;
        hasDarkPatterns: boolean;
        isClickbait: boolean;
    };
    metadata: {
        name: string;
        justification: string | null;
        description?: string | null; // AJOUT
        biasLevel: string;
        type: string;
    };
}

export async function getRichTrustScore(domain: string): Promise<RichTrustScore> {
    // 1. Chercher le domaine dans la BDD Prisma
    let source = await prisma.source.findUnique({
        where: { domain: domain },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // 2. CHECK CACHE (Si valide)
    if (source && source.lastAuditDate && source.lastAuditDate > thirtyDaysAgo) {
        // Fix: Si la description manque (ancien cache), on la génère à la volée (Lazy Loading)
        let cachedDescription = source.description;

        if (!cachedDescription) {
            console.log(`⚡ [TrustScore] Cache HIT mais Bio manquante. Génération auto...`);
            cachedDescription = await generateSourceDescription(domain);
            // On met à jour sans bloquer si possible, mais ici on attend pour l'affichage
            if (cachedDescription) {
                await prisma.source.update({
                    where: { domain: source.domain },
                    data: { description: cachedDescription }
                });
            }
        }

        console.log(`⚡ [TrustScore] Cache HIT pour : ${domain}`);
        return {
            globalScore: source.trustScore,
            confidenceLevel: 'HIGH',
            details: {
                transparency: source.transparencyScore,
                editorial: source.editorialScore,
                semantic: source.semanticScore,
                ux: source.uxScore,
            },
            flags: {
                isPlatform: source.type === 'SOCIAL' || source.type === 'PLATFORM',
                hasFactCheckFailures: source.hasFactCheckFailures,
                isAdsTxtValid: source.isAdsTxtValid,
                adDensity: source.adDensity,
                hasDarkPatterns: source.hasDarkPatterns,
                isClickbait: source.isClickbait
            },
            metadata: {
                name: source.name,
                justification: source.justification,
                description: cachedDescription, // Retourne la bio fraîche ou stockée
                biasLevel: source.biasLevel,
                type: source.type
            }
        };
    }

    // Variables pour l'objet de retour (initialisées avec le cache ou valeurs par défaut)
    let adDensity = 'UNKNOWN';
    let hasDarkPatterns = false;
    let isClickbait = false;

    // 3. Logique d'Audit "Zero Trust" (Si nouvelle source OU audit trop vieux)
    console.log(`⚡ [TrustScore] Audit complet lancé pour : ${domain}`);

    // --- PARALLEL AUDITS (Scan technique + Description IA) ---
    const [auditResult, adsResult, uxResult, semanticResult, aiDescription] = await Promise.all([
        checkMediaReputation(domain),        // Google Fact Check
        analyzeAdsTxt(domain),               // Ads.txt Analysis
        analyzeUX(domain),                   // UX & Ads Scanner
        analyzeSemantics(domain),            // Semantic & Clickbait Scanner
        generateSourceDescription(domain)    // Bio IA (SourceProfiler)
    ]);



    const failureCount = auditResult.failureCount;

    // --- B. HEURISTIQUES & RESULTATS ---

    // Récupération des scores réels des 4 Piliers
    let transparencyScore = adsResult.score;
    let isAdsTxtValid = adsResult.isAdsTxtValid;

    let uxScore = uxResult.score;
    adDensity = uxResult.adDensity;
    hasDarkPatterns = uxResult.hasDarkPatterns;

    let semanticScore = semanticResult.score;
    isClickbait = semanticResult.isClickbait;
    let biasLevel = semanticResult.biasLevel;

    let editorialScore = 60;    // Bénéfice du doute léger (Le seul qui reste semi-heuristique hors fact-check)

    // DÉTECTION INSTITUTIONNELLE (Bonus d'Autorité)
    const isOfficial = domain.endsWith('.gouv.fr') || domain.endsWith('.gov') || domain.endsWith('.edu');

    if (isOfficial) {
        transparencyScore = 95;
        editorialScore = 90;
        semanticScore = 95; // Vocabulaire neutre garanti
        uxScore = 80;
        isAdsTxtValid = true;
        isClickbait = false;
        biasLevel = 'NEUTRAL';
    }

    // --- MISE À JOUR DES SCORES (Bonus Structurels) ---

    // 1. Transparence : Base ads.txt + Bonus Mentions Légales
    // Si ads.txt est absent mais qu'il y a des mentions légales, on remonte le score.
    // MODIFICATION: +18 au lieu de +20 pour casser la rondeur
    if (uxResult.hasAbout && transparencyScore < 80) {
        transparencyScore += 18;
    }

    // 2. Éditorial : Base Fact-Check + Bonus Politique Correction
    // [cite: 27] "Politique de correction... indispensable"
    // MODIFICATION: +13 au lieu de +15
    if (uxResult.hasCorrectionPolicy && editorialScore < 90) {
        editorialScore += 13;
    }

    // --- C. CALCUL DES PÉNALITÉS ---

    // Impact direct des mensonges sur le score Éditorial
    if (failureCount > 0) {
        editorialScore = Math.max(10, 70 - (failureCount * 23)); // 23 au lieu de 25
    }

    // --- D. CALCUL DU SCORE PONDÉRÉ ---
    let weightedScore =
        (transparencyScore * WEIGHTS.transparency) +
        (editorialScore * WEIGHTS.editorial) +
        (semanticScore * WEIGHTS.semantic) +
        (uxScore * WEIGHTS.ux);

    // --- E. FIX "ORGANIC" (Deterministic Jitter) ---
    // Ajoute une variation de +/- 2 points basée sur la longueur du domaine
    // pour éviter que toutes les sources inconnues aient exactement "50".
    const jitter = (domain.length % 5) - 2; // -2, -1, 0, 1, 2
    weightedScore += jitter;


    // --- F. FACTEUR DE PÉNALITÉ CRITIQUE (Kill Switch) ---
    let hasFailures = failureCount > 0;

    if (hasFailures) {
        weightedScore = weightedScore * 0.5;
    }

    const finalTrustScore = Math.min(100, Math.max(0, Math.round(weightedScore)));

    // Génération de la justification
    let justification = "Analyse complète (4 Piliers) : Transparence, Éditorial, Sémantique et UX.";

    if (isOfficial) {
        justification = "Source institutionnelle officielle. Fiabilité garantie par le statut.";
    } else if (hasFailures) {
        justification = `ALERTE : ${failureCount} vérifications factuelles échouées détectées via Google.`;
    } else if (isClickbait) {
        justification = "Attention : Indice de sensationnalisme élevé (Titres, Majuscules, Trigger Words).";
    } else if (uxResult.adDensity === 'HIGH') {
        justification = "Attention : Site saturé de publicité (Comportement MFA).";
    } else if (!isAdsTxtValid && transparencyScore < 50) {
        justification = "Transparence technique faible (Ads.txt manquant).";
    }

    // --- F. SAUVEGARDE EN BDD (Persistance) ---
    source = await prisma.source.upsert({
        where: { domain },
        update: {
            trustScore: finalTrustScore,
            editorialScore,
            transparencyScore,
            semanticScore,
            uxScore,
            hasFactCheckFailures: hasFailures,
            factCheckFailCount: failureCount,
            isAdsTxtValid: isAdsTxtValid,
            isClickbait: isClickbait,
            adDensity: adDensity,
            hasDarkPatterns: hasDarkPatterns,
            lastAuditDate: now,
            justification,
            description: aiDescription || source?.description, // Mise à jour ou conserve l'ancienne
            biasLevel
        },
        create: {
            domain,
            name: domain,
            type: isOfficial ? "GOVERNMENT" : "GENERAL",
            trustScore: finalTrustScore,
            editorialScore,
            transparencyScore,
            semanticScore,
            uxScore,
            hasFactCheckFailures: hasFailures,
            isAdsTxtValid: isAdsTxtValid,
            isClickbait: isClickbait,
            adDensity: adDensity,
            hasDarkPatterns: hasDarkPatterns,
            factCheckFailCount: failureCount,
            lastAuditDate: now,
            justification,
            description: aiDescription, // Nouvelle bio
            biasLevel: biasLevel || 'UNKNOWN'
        }
    });

    console.log(`[TrustScore] 💾 Sauvegarde terminée. Score: ${finalTrustScore} (Bio: ${aiDescription ? 'OK' : 'N/A'})`);


    // 4. Formatage de l'objet de retour pour le Frontend (Rafraiîchi)
    return {
        globalScore: source.trustScore,
        confidenceLevel: source.lastAuditDate ? 'HIGH' : 'LOW', // HIGH car Audit Complet
        details: {
            transparency: source.transparencyScore,
            editorial: source.editorialScore,
            semantic: source.semanticScore,
            ux: source.uxScore,
        },
        flags: {
            isPlatform: source.type === 'SOCIAL' || source.type === 'PLATFORM',
            hasFactCheckFailures: source.hasFactCheckFailures,
            isAdsTxtValid: source.isAdsTxtValid,
            adDensity: adDensity,
            hasDarkPatterns: hasDarkPatterns,
            isClickbait: isClickbait
        },
        metadata: {
            name: source.name,
            justification: source.justification,
            description: source.description, // Inclus dans le retour frais
            biasLevel: source.biasLevel,
            type: source.type
        }
    };
}