import { GenerateArticleRequest } from "../../types/article";

export function buildArticlePrompt(request: GenerateArticleRequest): string {
  const { topic, language, style, generateImage } = request;

  let styleInstruction = "";
  switch (style) {
    case 'neutral':
      styleInstruction = "Adopte un style de reporter factuel. Structure en pyramide inversée. Ton objectif est l'information pure.";
      break;
    case 'explainer':
      styleInstruction = "Adopte un ton pédagogique et didactique. Commence par définir simplement le sujet. Utilise des analogies pour expliquer les concepts complexes. Structure : 'Comprendre', 'Les Enjeux', 'Perspectives'.";
      break;
    case 'short':
      styleInstruction = "Format 'Brève' ou 'Flash Info'. Sois extrêmement concis (max 300 mots). Va droit à l'essentiel. Utilise des listes à puces pour les faits marquants.";
      break;
    case 'indepth':
      styleInstruction = "Format 'Long-form' d'investigation. Analyse en profondeur (min 1000 mots). Explore l'historique, les nuances, et les multiples points de vue.";
      break;
    default:
      styleInstruction = "Style standard informatif.";
  }

  let langInstruction = "";
  if (language === 'fr') {
    langInstruction = "Rédige l'intégralité du contenu en FRANÇAIS.";
  } else {
    langInstruction = "Write the entire content in ENGLISH.";
  }

  const jsonSchema = `{
  "title": "String (Titre percutant)",
  "summary": "String (Résumé accrocheur en 2 phrases)",
  "content": "Markdown String (Le corps de l'article, avec formattage riche, titres #, ##, et citations [Source])",
  "tags": ["String", "String"],
  "category": "${request.category || "General"}",
  "imagePrompt": ${generateImage ? "'String (Description DALL-E en Anglais, photoréaliste)'" : "null"},
  "detectedSources": ["Url1", "Url2"]
}`;

  return `
Tu es un Rédacteur en Chef IA expert.
SUJET: "${topic}"

DIRECTIVES DE STYLE :
${styleInstruction}

LANGUE :
${langInstruction}

FORMAT DE RÉPONSE ATTENDU (JSON STRICT) :
Tu dois répondre UNIQUEMENT avec un objet JSON valide suivant ce schéma exact :
${jsonSchema}

RÈGLES IMPORTANTES :
1. Le "content" doit être du Markdown valide.
2. Cite tes sources explicitement dans le texte si tu trouves des informations factuelles (ex: "Selon l'AFP...").
3. Remplis "detectedSources" avec les URLs réelles que tu as utilisées pour vérifier les faits.
4. Ne mets pas de bloc de code (\`\`\`json), renvoie le JSON brut.
`;
}
