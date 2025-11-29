export type Rigor = 'fast' | 'balanced' | 'precise';
export const RIGOR_LEVELS: Rigor[] = ['fast','balanced','precise'];
export const RIGOR_LABEL: Record<Rigor,string> = {
  fast: 'Fast',
  balanced: 'Balanced',
  precise: 'Precise',
};
