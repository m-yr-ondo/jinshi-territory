import { DEFAULT_PLAYER_SKIN_ID, isPlayerSkinId, type JoinOptions } from '@jinshi-territory/shared';

const PLAYER_ID = /^[a-zA-Z0-9_-]{8,80}$/;

export function validateLocalIdentity(value: unknown): JoinOptions {
  if (!value || typeof value !== 'object') throw new Error('Join options are required');
  const candidate = value as Partial<JoinOptions>;
  const playerId = String(candidate.playerId ?? '').trim();
  const displayName = String(candidate.displayName ?? '')
    .replace(/[\p{Cc}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  if (!PLAYER_ID.test(playerId)) throw new Error('Invalid local player ID');
  if (displayName.length < 1) throw new Error('Display name is required');
  const skinId = isPlayerSkinId(candidate.skinId) ? candidate.skinId : DEFAULT_PLAYER_SKIN_ID;
  return {
    playerId,
    displayName,
    skinId
  };
}
