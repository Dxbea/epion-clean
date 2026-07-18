import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

function model(name: string) {
  const definition = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`Missing Prisma model: ${name}`);
  return definition;
}

describe('discovery corpus Prisma contract', () => {
  it('keeps discovery sources disabled until an orchestrator explicitly enables them', () => {
    const enabled = model('DiscoverySource').fields.find((field) => field.name === 'enabled');

    expect(enabled?.default).toBe(false);
  });

  it('enforces one canonical document per canonical URL hash', () => {
    const document = model('IngestedDocument');
    const canonicalUrlHash = document.fields.find((field) => field.name === 'canonicalUrlHash');
    const canonicalizationVersion = document.fields.find(
      (field) => field.name === 'canonicalizationVersion',
    );

    expect(canonicalUrlHash?.isUnique).toBe(true);
    expect(canonicalizationVersion?.default).toBe(1);
  });

  it('deduplicates connector occurrences by URL hash and external identifier', () => {
    expect(model('DocumentDiscovery').uniqueFields).toEqual([
      ['discoverySourceId', 'discoveredUrlHash'],
      ['discoverySourceId', 'externalId'],
    ]);
  });
});
