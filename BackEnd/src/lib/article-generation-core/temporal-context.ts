export interface TemporalContext {
  currentDate: string;
  currentYear: number;
  timezone: string;
}

export interface TemporalContextOptions {
  now?: Date;
  timezone?: string;
}

/**
 * Supplies one execution-time temporal anchor to every editorial AI prompt.
 * Dates from evidence remain source data; this context only tells the model how
 * to interpret them relative to the current run.
 */
export function temporalContext(options: TemporalContextOptions = {}): TemporalContext {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Temporal context requires a valid current date');
  const timezone = options.timezone?.trim() || process.env.EPION_TIMEZONE?.trim() || 'Europe/Paris';
  const parts = zonedDateParts(now, timezone);
  return {
    currentDate: `${parts.year}-${parts.month}-${parts.day}`,
    currentYear: Number(parts.year),
    timezone,
  };
}

export function temporalContextPrompt(options: TemporalContextOptions = {}): string {
  const context = temporalContext(options);
  return `## CONTEXTE TEMPOREL EPIon
- currentDate ISO: ${context.currentDate}
- currentYear: ${context.currentYear}
- timezone: ${context.timezone}
- Si le sujet concerne l'actualité, ne centre jamais le titre, le résumé, l'article ou l'analyse sur un événement ancien (par exemple une édition 2023) sauf si la demande mentionne explicitement cet événement ou demande un contexte historique.
- Pour chaque source, examine publishedAt et sourceUpdatedAt lorsqu'ils sont fournis. Une source ancienne peut servir au contexte historique, mais ne doit pas devenir la preuve principale d'une actualité sans lien explicite avec cette période.
- Si une source est trop ancienne pour le sujet actuel, signale clairement sa limite temporelle ou écarte-la des affirmations principales. Ne déduis jamais qu'une information ancienne est actuelle.`;
}

function zonedDateParts(now: Date, timezone: string): Record<string, string> {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]));
  } catch {
    return {
      year: String(now.getUTCFullYear()),
      month: String(now.getUTCMonth() + 1).padStart(2, '0'),
      day: String(now.getUTCDate()).padStart(2, '0'),
    };
  }
}
