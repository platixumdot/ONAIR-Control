import { describe, expect, it } from 'vitest';
import { getSceneBadgeState } from './sceneState';

describe('getSceneBadgeState', () => {
  it('marks the active program scene', () => {
    expect(getSceneBadgeState('Cam A', 'Cam A', 'Cam B')).toBe('program');
  });

  it('marks the preview scene separately', () => {
    expect(getSceneBadgeState('Cam B', 'Cam A', 'Cam B')).toBe('preview');
  });

  it('keeps unselected scenes neutral', () => {
    expect(getSceneBadgeState('Cam C', 'Cam A', 'Cam B')).toBe('scene');
  });
});
