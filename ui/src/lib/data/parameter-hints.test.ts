import { describe, expect, it } from 'vitest';

import { FORMAT_PRESETS, SUPPORTED_FORMAT_TOKENS } from '@keyra/engine';
import {
  PARAMETER_HINTS,
  getParameterHint,
  hintToSlotOptions,
} from './parameter-hints';

// ---------------------------------------------------------------------------
// SUPPORTED_FORMAT_TOKENS (engine export)
// ---------------------------------------------------------------------------

describe('SUPPORTED_FORMAT_TOKENS', () => {
  it('includes all base date tokens', () => {
    expect(SUPPORTED_FORMAT_TOKENS).toContain('YYYY');
    expect(SUPPORTED_FORMAT_TOKENS).toContain('MM');
    expect(SUPPORTED_FORMAT_TOKENS).toContain('DD');
    expect(SUPPORTED_FORMAT_TOKENS).toContain('HH');
    expect(SUPPORTED_FORMAT_TOKENS).toContain('mm');
    expect(SUPPORTED_FORMAT_TOKENS).toContain('ss');
  });

  it('includes ISO8601 keyword', () => {
    expect(SUPPORTED_FORMAT_TOKENS).toContain('ISO8601');
  });

  it('has 7 entries (6 base tokens + ISO8601)', () => {
    expect(SUPPORTED_FORMAT_TOKENS).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// FORMAT_PRESETS (engine export)
// ---------------------------------------------------------------------------

describe('FORMAT_PRESETS', () => {
  it('includes ISO8601', () => {
    expect(FORMAT_PRESETS).toContain('ISO8601');
  });

  it('includes YYYY-MM-DD', () => {
    expect(FORMAT_PRESETS).toContain('YYYY-MM-DD');
  });

  it('includes MM/DD/YYYY', () => {
    expect(FORMAT_PRESETS).toContain('MM/DD/YYYY');
  });

  it('includes DD/MM/YYYY', () => {
    expect(FORMAT_PRESETS).toContain('DD/MM/YYYY');
  });

  it('includes ISO datetime preset', () => {
    expect(FORMAT_PRESETS).toContain('YYYY-MM-DDTHH:mm:ssZ');
  });

  it('all presets are valid compositions of base tokens', () => {
    const baseTokens = SUPPORTED_FORMAT_TOKENS;
    for (const preset of FORMAT_PRESETS) {
      if (preset === 'ISO8601') continue; // special keyword
      // Each preset must contain at least one base token
      const containsToken = baseTokens.some((t) => preset.includes(t));
      expect(containsToken, `Preset "${preset}" contains no base tokens`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// PARAMETER_HINTS registry
// ---------------------------------------------------------------------------

describe('PARAMETER_HINTS — formatDate.inputFormat', () => {
  it('has an entry for formatDate.inputFormat', () => {
    expect(PARAMETER_HINTS['formatDate']?.['inputFormat']).toBeDefined();
  });

  it('is of type tokens', () => {
    expect(PARAMETER_HINTS['formatDate']?.['inputFormat']?.type).toBe('tokens');
  });

  it('tokens are derived from SUPPORTED_FORMAT_TOKENS', () => {
    const hint = PARAMETER_HINTS['formatDate']?.['inputFormat'];
    if (hint?.type !== 'tokens') throw new Error('Expected tokens hint');
    expect(hint.tokens).toEqual(SUPPORTED_FORMAT_TOKENS);
  });

  it('presets are derived from FORMAT_PRESETS', () => {
    const hint = PARAMETER_HINTS['formatDate']?.['inputFormat'];
    if (hint?.type !== 'tokens') throw new Error('Expected tokens hint');
    expect(hint.presets).toEqual(FORMAT_PRESETS);
  });

  it('allowFreeform is true', () => {
    const hint = PARAMETER_HINTS['formatDate']?.['inputFormat'];
    if (hint?.type !== 'tokens') throw new Error('Expected tokens hint');
    expect(hint.allowFreeform).toBe(true);
  });
});

describe('PARAMETER_HINTS — formatDate.outputFormat', () => {
  it('has an entry for formatDate.outputFormat', () => {
    expect(PARAMETER_HINTS['formatDate']?.['outputFormat']).toBeDefined();
  });

  it('is of type tokens', () => {
    expect(PARAMETER_HINTS['formatDate']?.['outputFormat']?.type).toBe('tokens');
  });

  it('tokens match SUPPORTED_FORMAT_TOKENS', () => {
    const hint = PARAMETER_HINTS['formatDate']?.['outputFormat'];
    if (hint?.type !== 'tokens') throw new Error('Expected tokens hint');
    expect(hint.tokens).toEqual(SUPPORTED_FORMAT_TOKENS);
  });
});

describe('PARAMETER_HINTS — cast.targetType', () => {
  it('has an entry for cast.targetType', () => {
    expect(PARAMETER_HINTS['cast']?.['targetType']).toBeDefined();
  });

  it('is of type enum', () => {
    expect(PARAMETER_HINTS['cast']?.['targetType']?.type).toBe('enum');
  });

  it('options are exactly string, number, boolean', () => {
    const hint = PARAMETER_HINTS['cast']?.['targetType'];
    if (hint?.type !== 'enum') throw new Error('Expected enum hint');
    expect(hint.options).toEqual(['string', 'number', 'boolean']);
  });
});

// ---------------------------------------------------------------------------
// getParameterHint helper
// ---------------------------------------------------------------------------

describe('getParameterHint', () => {
  it('returns hint for known (functionName, parameterName)', () => {
    const hint = getParameterHint('cast', 'targetType');
    expect(hint).toBeDefined();
    expect(hint?.type).toBe('enum');
  });

  it('returns undefined for unknown function', () => {
    expect(getParameterHint('unknownFn', 'value')).toBeUndefined();
  });

  it('returns undefined for unknown parameter on known function', () => {
    expect(getParameterHint('cast', 'unknownParam')).toBeUndefined();
  });

  it('returns formatDate.inputFormat hint', () => {
    const hint = getParameterHint('formatDate', 'inputFormat');
    expect(hint?.type).toBe('tokens');
  });
});

// ---------------------------------------------------------------------------
// hintToSlotOptions helper
// ---------------------------------------------------------------------------

describe('hintToSlotOptions', () => {
  it('returns options array for enum hint', () => {
    const hint = PARAMETER_HINTS['cast']?.['targetType']!;
    expect(hintToSlotOptions(hint)).toEqual(['string', 'number', 'boolean']);
  });

  it('returns presets array for token hint', () => {
    const hint = PARAMETER_HINTS['formatDate']?.['inputFormat']!;
    expect(hintToSlotOptions(hint)).toEqual(FORMAT_PRESETS);
  });
});
