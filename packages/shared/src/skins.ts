export interface PlayerSkinDefinition {
  id: string;
  name: string;
  color: number;
  accent: number;
}

export const PLAYER_SKINS = [
  { id: 'cyan', name: 'Cyan', color: 0x55d7ff, accent: 0xd9f8ff },
  { id: 'coral', name: 'Coral', color: 0xff5c8a, accent: 0xffd4df },
  { id: 'lime', name: 'Lime', color: 0x8aef74, accent: 0xe4ffdd },
  { id: 'sun', name: 'Sun', color: 0xffcf55, accent: 0xfff1bd },
  { id: 'violet', name: 'Violet', color: 0xa77bff, accent: 0xe9dcff },
  { id: 'ember', name: 'Ember', color: 0xff835c, accent: 0xffded3 },
  { id: 'mint', name: 'Mint', color: 0x4de7b1, accent: 0xd1fff0 },
  { id: 'ocean', name: 'Ocean', color: 0x5f8cff, accent: 0xd9e3ff },
  { id: 'rose', name: 'Rose', color: 0xf06bd8, accent: 0xffdbf7 },
  { id: 'acid', name: 'Acid', color: 0xc9ed5b, accent: 0xf4ffc9 },
  { id: 'indigo', name: 'Indigo', color: 0x7868ff, accent: 0xddd9ff },
  { id: 'aqua', name: 'Aqua', color: 0x33c8d7, accent: 0xd2fbff }
] as const satisfies readonly PlayerSkinDefinition[];

export type PlayerSkinId = (typeof PLAYER_SKINS)[number]['id'];
export const DEFAULT_PLAYER_SKIN_ID: PlayerSkinId = 'cyan';

export function isPlayerSkinId(value: unknown): value is PlayerSkinId {
  return typeof value === 'string' && PLAYER_SKINS.some((skin) => skin.id === value);
}

export function playerSkin(id: string): PlayerSkinDefinition {
  return PLAYER_SKINS.find((skin) => skin.id === id) ?? PLAYER_SKINS[0];
}
