export interface PlayerSkinDefinition {
  id: string;
  name: string;
  color: number;
}

export const PLAYER_SKINS = [
  { id: 'neon-cyan', name: 'Neon Cyan', color: 0x00eaff },
  { id: 'hot-pink', name: 'Hot Pink', color: 0xff2d95 },
  { id: 'acid-lime', name: 'Acid Lime', color: 0x9dff00 },
  { id: 'solar-yellow', name: 'Solar Yellow', color: 0xffe600 },
  { id: 'electric-violet', name: 'Electric Violet', color: 0xa855ff },
  { id: 'blaze-orange', name: 'Blaze Orange', color: 0xff5a1f },
  { id: 'neon-mint', name: 'Neon Mint', color: 0x00ff9d },
  { id: 'laser-blue', name: 'Laser Blue', color: 0x2979ff },
  { id: 'shock-magenta', name: 'Shock Magenta', color: 0xff00d4 },
  { id: 'chartreuse', name: 'Chartreuse', color: 0xc7ff00 },
  { id: 'ultraviolet', name: 'Ultraviolet', color: 0x6c3bff },
  { id: 'turquoise', name: 'Turquoise', color: 0x00d8c8 },
  { id: 'scarlet', name: 'Scarlet', color: 0xff3045 },
  { id: 'emerald', name: 'Emerald', color: 0x00d95f },
  { id: 'orchid', name: 'Orchid', color: 0xe65cff },
  { id: 'tangerine', name: 'Tangerine', color: 0xff8a00 },
  { id: 'ice-blue', name: 'Ice Blue', color: 0x6be7ff },
  { id: 'ruby', name: 'Ruby', color: 0xe8005a },
  { id: 'electric-blue', name: 'Electric Blue', color: 0x006bff },
  { id: 'neon-gold', name: 'Neon Gold', color: 0xffbd00 }
] as const satisfies readonly PlayerSkinDefinition[];

export type PlayerSkinId = (typeof PLAYER_SKINS)[number]['id'];
export const DEFAULT_PLAYER_SKIN_ID: PlayerSkinId = 'neon-cyan';

export function isPlayerSkinId(value: unknown): value is PlayerSkinId {
  return typeof value === 'string' && PLAYER_SKINS.some((skin) => skin.id === value);
}

export function playerSkin(id: string): PlayerSkinDefinition {
  return PLAYER_SKINS.find((skin) => skin.id === id) ?? PLAYER_SKINS[0];
}
