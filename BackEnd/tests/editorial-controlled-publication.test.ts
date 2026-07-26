import { describe, expect, it } from 'vitest';
import { parseControlledPublicationOptions } from '../src/scripts/editorial-automation-publish-once.js';

describe('controlled editorial publication command', () => {
  it('requires the explicit one-article publication confirmation', () => {
    expect(() => parseControlledPublicationOptions([]))
      .toThrow('Confirmation required: --confirm=EPION_EDITORIAL_PUBLISH_ONE');
    expect(() => parseControlledPublicationOptions([
      '--confirm=EPION_EDITORIAL_PUBLISH_ONE',
      '--no-publish',
    ])).toThrow('--no-publish is incompatible');
  });

  it('keeps the polling window bounded', () => {
    expect(parseControlledPublicationOptions([
      '--confirm=EPION_EDITORIAL_PUBLISH_ONE',
      '--wait-ms=900000',
      '--indexed-lookback-hours=48',
    ])).toEqual({ waitMs: 900_000, indexedLookbackHours: 48 });
    expect(() => parseControlledPublicationOptions([
      '--confirm=EPION_EDITORIAL_PUBLISH_ONE',
      '--wait-ms=3600000',
    ])).toThrow('--wait-ms must be an integer');
  });
});
