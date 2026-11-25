import { describe, expect, it } from 'vitest';
import {
  isPosSoundEnabled,
  playPosAddBeep,
  playPosErrorTone,
  playPosSuccessChime,
  setPosSoundEnabled,
} from '@/lib/posSound';

describe('Task 10 · Feedback auditivo opcional POS (posSound.ts)', () => {
  it('falla de forma silenciosa y segura en entorno sin window/AudioContext', () => {
    expect(isPosSoundEnabled()).toBe(true);
    expect(() => setPosSoundEnabled(false)).not.toThrow();
    expect(() => playPosAddBeep()).not.toThrow();
    expect(() => playPosSuccessChime()).not.toThrow();
    expect(() => playPosErrorTone()).not.toThrow();
  });
});
