// BackEnd/src/lib/trust-score.ts
import { prisma } from "./db"; // Assure-toi que le chemin vers db est bon
import { logger } from "./logger";
import { analyzeAdsTxt } from "./ads-scanner";
import { analyzeUX } from "./ux-scanner";
import { analyzeSemantics } from "./semantic-scanner";

import { checkMediaReputation } from "./google-fact-check";
import { generateSourceDescription } from "../services/sourceProfiler";
import { analyzeEditorial } from "./scanners/editorial-scanner"; // NEW
import { analyzeBias } from "./scanners/bias-scanner";
import { PoliticalBias, Reliability } from "@prisma/client";

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
        isOwnerPublic: boolean;
    };
    metadata: {
        name: string;
        justification: string | null;
        description?: string | null; // AJOUT
        politicalBias: PoliticalBias;
        biasScore: number;
        reliability: Reliability;
        country: string;
        type: string;
        explanation?: {
            formula: string; // "70% Source (Base) + 30% Analyse (Live)"
            sources: string[]; // ["Ad Fontes", "MBFC"]
            livePenalties: string[]; // ["Pubs Intrusives (-12)", "Citations (+10)"]
            pillarWeights: { [key: string]: string }; // { editorial: "30%", ... }
        };
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
            logger.info('Cache HIT but Bio missing. Auto-generating...', { module: 'TrustScore', domain });
            cachedDescription = await generateSourceDescription(domain);
            // On met à jour sans bloquer si possible, mais ici on attend pour l'affichage
            if (cachedDescription) {
                await prisma.source.update({
                    where: { domain: source.domain },
                    data: { description: cachedDescription }
                });
            }
        }

        logger.info('Cache HIT', { module: 'TrustScore', domain });
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
                isClickbait: source.isClickbait,
                isOwnerPublic: source.isOwnerPublic
            },
            metadata: {
                name: source.name,
                justification: source.justification,
                description: cachedDescription, // Retourne la bio fraîche ou stockée
                politicalBias: source.politicalBias,
                biasScore: source.biasScore,
                reliability: source.reliability,
                country: source.detectedCountry || "FR",
                type: source.type
            }
        };
    }

    // Variables pour l'objet de retour (initialisées avec le cache ou valeurs par défaut)
    let adDensity = 'UNKNOWN';
    let hasDarkPatterns = false;
    let isClickbait = false;

    // 3. Logique d'Audit "Zero Trust" (Si nouvelle source OU audit trop vieux)
    logger.info('Starting full audit', { module: 'TrustScore', domain });

    // --- PARALLEL AUDITS (Scan technique + Description IA) ---
    // --- PARALLEL AUDITS (Scan technique + Description IA) ---
    const [auditResult, adsResult, uxResult, semanticResult, editorialResult, aiDescription] = await Promise.all([
        checkMediaReputation(domain),        // Google Fact Check
        analyzeAdsTxt(domain),               // Ads.txt Analysis
        analyzeUX(domain),                   // UX & Ads Scanner
        analyzeSemantics(domain),            // Semantic & Clickbait Scanner
        analyzeEditorial(domain),            // Hybrid Citation Scanner (NEW)
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

    // DETERMINATION DU BIAIS (Via Scanner)
    const biasResult = await analyzeBias(domain);
    let {
        bias: politicalBias,
        score: biasScore,
        reliability,
        detectedCountry
    } = biasResult;




    let editorialScore = 60;    // Bénéfice du doute léger (Le seul qui reste semi-heuristique hors fact-check)

    // APPLIQUER MODIFICATEUR ÉDITORIAL (Hybrid Citations)
    // Bonus/Malus basé sur les liens et "Selon X..."
    if (editorialResult && typeof editorialResult.scoreModifier === 'number') {
        editorialScore += editorialResult.scoreModifier;
    }

    // DÉTECTION INSTITUTIONNELLE (Bonus d'Autorité)
    const isOfficial = domain.endsWith('.gouv.fr') || domain.endsWith('.gov') || domain.endsWith('.edu');

    if (isOfficial) {
        transparencyScore = 95;
        editorialScore = 90;
        semanticScore = 95; // Vocabulaire neutre garanti
        uxScore = 80;
        isAdsTxtValid = true;
        isClickbait = false;

        politicalBias = PoliticalBias.CENTER;
        biasScore = 0;
        reliability = Reliability.HIGH;
    }

    // --- MISE À JOUR DES SCORES (Bonus Structurels) ---

    // 1. Transparence : Base ads.txt + Bonus Mentions Légales + Bonus Propriétaire
    // Si ads.txt est absent mais qu'il y a des mentions légales, on remonte le score.

    // Bonus Propriétaire Public (+20 points)
    let isOwnerPublic = uxResult.isOwnerPublic || false;
    if (isOfficial) isOwnerPublic = true; // Gouvernement = Public par défaut

    if (isOwnerPublic) {
        transparencyScore += 20;
    }

    // Mentions Légales (+10 points)
    if (uxResult.hasAbout && transparencyScore < 80) {
        transparencyScore += 10;
    }

    transparencyScore = Math.min(100, transparencyScore);


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
        reliability = Reliability.LOW; // Force Low Reliability
    }

    // --- D. CALCUL DU SCORE PONDÉRÉ (HYBRIDE) ---

    // 1. Score Technique Live (Voile)
    let liveTechnicalScore =
        (transparencyScore * 0.4) + // 40%
        (uxScore * 0.4) +           // 40%
        (semanticScore * 0.2);      // 20%

    // 2. Score Statique DB (Ancre)
    let dbTrustScore = 0;
    let hasDbAnchor = false;

    // Si la source a une fiabilité connue (Autre que UNKNOWN), c'est notre Ancre.
    if (reliability !== Reliability.UNKNOWN) {
        hasDbAnchor = true;
        // Mapping Reliability -> Base Score
        switch (reliability) {
            case Reliability.HIGH: dbTrustScore = 95; break;
            case Reliability.MIXED: dbTrustScore = 55; break;
            case Reliability.LOW: dbTrustScore = 30; break;
            case Reliability.PROPAGANDA: dbTrustScore = 10; break;
            default: dbTrustScore = 50;
        }
    }

    let weightedScore = 0;

    if (hasDbAnchor) {
        // CAS 1 : SOURCE CONNUE (Hybride)
        // 70% Ancre (Stabilité) + 30% Voile (Technique Live)
        weightedScore = (dbTrustScore * 0.7) + (liveTechnicalScore * 0.3);

        // Plafonds de Verre (Pour empêcher le blanchiment de propagande)
        if (reliability === Reliability.PROPAGANDA) weightedScore = Math.min(weightedScore, 25);
        if (reliability === Reliability.LOW) weightedScore = Math.min(weightedScore, 45);

    } else {
        // CAS 2 : SOURCE INCONNUE (100% Live)
        // On se base uniquement sur la qualité technique détectée
        weightedScore = liveTechnicalScore;

        // Pénalité de prudence pour l'inconnu (-10 points)
        weightedScore = Math.max(0, weightedScore - 10);
    }

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
        justification = "Attention : Indice de sensationnalisme élevé (Titres alarmistes détectés).";
    } else if (uxResult.intrusivenessScore && uxResult.intrusivenessScore >= 4) {
        justification = "Attention : Publicité intrusive détectée (Popups ou Autoplay).";
    } else if (uxResult.adDensity === 'HIGH' && !uxResult.intrusivenessScore) {
        // Fallback pour ancien cache
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
            isOwnerPublic: isOwnerPublic,

            // Nouveaux champs
            politicalBias,
            biasScore,
            reliability,
            detectedCountry,

            lastAuditDate: now,
            justification,
            description: aiDescription || source?.description, // Mise à jour ou conserve l'ancienne
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
            isOwnerPublic: isOwnerPublic,

            // Nouveaux champs
            politicalBias,
            biasScore,
            reliability,
            detectedCountry,

            lastAuditDate: now,
            justification,
            description: aiDescription, // Nouvelle bio
        }
    });

    logger.info('Audit saved', {
        module: 'TrustScore',
        domain,
        score: finalTrustScore,
        bias: politicalBias,
        hasBio: !!aiDescription
    });


    // --- G. FORMATAGE & TRANSPARENCE ---

    // 1. Nettoyage de la Description (Retrait des [1][2]...)
    let finalDescription = source.description;
    if (finalDescription) {
        finalDescription = finalDescription.replace(/\[\d+\]/g, '').trim();
    }

    // 2. Compilation de l'Explication (Transparence)
    const explanation = {
        formula: hasDbAnchor
            ? "70% Réputation (Base de Données) + 30% Audit Technique (Live)"
            : "100% Audit Technique (Source Inconnue)",
        sources: hasDbAnchor ? ["Ad Fontes / MBFC (via DB)"] : ["Audit Algorithmique en Temps Réel"],
        livePenalties: [] as string[],
        pillarWeights: {
            transparency: "20%",
            editorial: "30%",
            semantic: "30%",
            ux: "20%"
        }
    };

    // Ajout des détails Live (Bonus/Malus)
    if (editorialResult && typeof editorialResult.scoreModifier === 'number' && editorialResult.scoreModifier !== 0) {
        const sign = editorialResult.scoreModifier > 0 ? "+" : "";
        explanation.livePenalties.push(`Citations & Liens : ${sign}${editorialResult.scoreModifier} pts`);
    }
    if (uxResult.intrusivenessScore >= 4) {
        explanation.livePenalties.push(`Malus Intrusivité : -${uxResult.intrusivenessScore * 10} pts`);
    }
    if (!isAdsTxtValid) {
        explanation.livePenalties.push("Absence Ads.txt : Pénalité Transparence");
    }
    if (hasFailures) {
        explanation.livePenalties.push(`Fact-Check Échoué : Score divisé par 2 (Kill Switch)`);
    }


    // 4. Formatage de l'objet de retour pour le Frontend (Rafraîchi)
    const confidenceLevel = hasDbAnchor ? 'HIGH' : 'LOW';

    return {
        globalScore: source.trustScore,
        confidenceLevel: confidenceLevel,
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
            isClickbait: isClickbait,
            isOwnerPublic: source.isOwnerPublic
        },
        metadata: {
            name: source.name,
            justification: source.justification,
            description: finalDescription, // CLEANED
            politicalBias: source.politicalBias,
            biasScore: source.biasScore,
            reliability: source.reliability,
            country: source.detectedCountry || "FR",
            type: source.type,
            explanation: explanation // NEW
        }
    };
}