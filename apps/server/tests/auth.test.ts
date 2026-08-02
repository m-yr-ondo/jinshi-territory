import { JWT } from '@colyseus/auth';
import { DEFAULT_PLAYER_SKIN_ID } from '@jinshi-territory/shared';
import { describe, expect, it } from 'vitest';
import { discordJoinOptions, verifyDiscordActivity } from '../src/auth/DiscordIdentity.js';
import { validateLocalIdentity } from '../src/auth/LocalIdentity.js';

describe('local skin selection', () => {
  it('accepts catalogue IDs and replaces arbitrary values with the default', () => {
    expect(
      validateLocalIdentity({
        playerId: 'player_valid',
        displayName: 'Player',
        skinId: 'coral'
      }).skinId
    ).toBe('coral');
    expect(
      validateLocalIdentity({
        playerId: 'player_invalid',
        displayName: 'Player',
        skinId: 'https://example.com/uploaded-skin.png'
      }).skinId
    ).toBe(DEFAULT_PLAYER_SKIN_ID);
  });
});

describe('Discord Activity identity', () => {
  it('uses the verified Discord identity while retaining only a valid selected skin', () => {
    const auth = {
      id: '123456789012345678',
      username: 'discord-user',
      globalName: 'Verified Player',
      avatar: null,
      guildId: '223456789012345678',
      channelId: '323456789012345678'
    };
    expect(
      discordJoinOptions(
        {
          playerId: 'spoofed_player',
          displayName: 'Spoofed Name',
          skinId: 'violet'
        },
        auth
      )
    ).toEqual({
      playerId: auth.id,
      displayName: auth.globalName,
      skinId: 'violet',
      guildId: auth.guildId,
      channelId: auth.channelId
    });
  });

  it('accepts a signed token only for its original guild and channel', async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
    const auth = {
      id: '123456789012345678',
      username: 'discord-user',
      globalName: null,
      avatar: null,
      guildId: '223456789012345678',
      channelId: '323456789012345678'
    };
    const token = await JWT.sign(auth);
    await expect(
      verifyDiscordActivity(token, { guildId: auth.guildId, channelId: auth.channelId })
    ).resolves.toMatchObject(auth);
    await expect(
      verifyDiscordActivity(token, {
        guildId: auth.guildId,
        channelId: '423456789012345678'
      })
    ).rejects.toThrow('Discord Activity identity could not be verified');
  });
});
