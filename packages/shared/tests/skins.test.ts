import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_SKIN_ID, PLAYER_SKINS, isPlayerSkinId, playerSkin } from '../src/index.js';

describe('player color catalogue', () => {
  it('contains twenty unique high-contrast solid presets', () => {
    expect(PLAYER_SKINS).toHaveLength(20);
    expect(new Set(PLAYER_SKINS.map((skin) => skin.id)).size).toBe(20);
    expect(new Set(PLAYER_SKINS.map((skin) => skin.color)).size).toBe(20);
    expect(PLAYER_SKINS.every((skin) => isPlayerSkinId(skin.id))).toBe(true);
  });

  it('falls back safely for an unknown preset', () => {
    expect(playerSkin('unknown').id).toBe(DEFAULT_PLAYER_SKIN_ID);
  });
});
