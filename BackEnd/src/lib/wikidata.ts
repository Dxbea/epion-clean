import axios from 'axios';
import { logger } from './logger';

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_TIMEOUT_MS = 8000;
const WIKIDATA_USER_AGENT = 'EpionBot/1.0 (contact@epion.app)';

interface WikidataBindingValue {
    type?: string;
    value?: string;
}

interface WikidataBinding {
    item?: WikidataBindingValue;
    itemLabel?: WikidataBindingValue;
    itemDescription?: WikidataBindingValue;
}

interface WikidataResponse {
    results?: {
        bindings?: WikidataBinding[];
    };
}

export interface WikidataEntity {
    id: string;
    label: string;
    description?: string;
    url: string;
}

function isWikidataEntity(entity: WikidataEntity | null): entity is WikidataEntity {
    return entity !== null;
}

function escapeSparqlLiteral(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
        .trim();
}

function extractEntityId(entityUrl: string | undefined): string | null {
    if (!entityUrl) {
        return null;
    }

    const match = entityUrl.match(/\/(Q\d+)$/i);
    return match?.[1] || null;
}

function buildSearchEntityQuery(name: string): string {
    const safeName = escapeSparqlLiteral(name);

    return `
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX wikibase: <http://wikiba.se/ontology#>

SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
  ?item rdfs:label ?label .
  FILTER(LANG(?label) IN ("fr", "en"))
  FILTER(CONTAINS(LCASE(STR(?label)), LCASE("${safeName}")))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
LIMIT 5
`.trim();
}

export async function searchEntity(name: string): Promise<WikidataEntity[]> {
    const cleanName = name.trim();
    if (!cleanName) {
        return [];
    }

    try {
        const response = await axios.get<WikidataResponse>(WIKIDATA_ENDPOINT, {
            params: {
                query: buildSearchEntityQuery(cleanName),
                format: 'json',
            },
            timeout: WIKIDATA_TIMEOUT_MS,
            headers: {
                Accept: 'application/sparql-results+json',
                'User-Agent': WIKIDATA_USER_AGENT,
            },
        });

        const bindings = Array.isArray(response.data?.results?.bindings)
            ? response.data.results.bindings
            : [];

        const entities = bindings
            .map<WikidataEntity | null>((binding) => {
                const itemUrl = binding.item?.value;
                const id = extractEntityId(itemUrl);
                if (!itemUrl || !id) {
                    return null;
                }

                return {
                    id,
                    label: binding.itemLabel?.value?.trim() || id,
                    description: binding.itemDescription?.value?.trim() || undefined,
                    url: itemUrl,
                } satisfies WikidataEntity;
            })
            .filter(isWikidataEntity);

        return entities;
    } catch (error: unknown) {
        const message = axios.isAxiosError(error)
            ? error.response?.data && typeof error.response.data === 'object'
                ? JSON.stringify(error.response.data)
                : error.message
            : error instanceof Error
                ? error.message
                : 'Unknown Wikidata error';

        logger.warn('Wikidata entity search failed', {
            module: 'Wikidata',
            query: cleanName,
            error: message,
        });

        return [];
    }
}
