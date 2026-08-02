import './styles.css';
import { authenticateActivity, isDiscordActivityBuild } from './discord.js';
import { TerritoryGame } from './game/TerritoryGame.js';
import { JoinScreen } from './ui/JoinScreen.js';

const root = document.querySelector<HTMLElement>('#game-root');
if (!root) throw new Error('Missing #game-root');
const gameRoot = root;

function showStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Could not start Jinshi Territory';
  const screen = document.createElement('main');
  screen.className = 'startup-error';
  const title = document.createElement('h1');
  title.textContent = 'Couldn’t open the arena';
  const detail = document.createElement('p');
  detail.textContent = message;
  const retry = document.createElement('button');
  retry.className = 'primary';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => location.reload());
  screen.append(title, detail, retry);
  gameRoot.replaceChildren(screen);
}

async function start(): Promise<void> {
  const auth = await authenticateActivity();
  const endpoint = isDiscordActivityBuild()
    ? '/colyseus'
    : import.meta.env.VITE_SERVER_URL ||
      (location.port === '5175'
        ? `${location.protocol}//${location.hostname}:2570`
        : location.origin);
  const game = new TerritoryGame(gameRoot, endpoint, auth?.token);
  await game.initialize();
  const join = new JoinScreen(
    (options) => game.join(options),
    auth
      ? {
          playerId: auth.user.id,
          displayName: auth.user.globalName || auth.user.username,
          guildId: auth.user.guildId,
          channelId: auth.user.channelId,
          locked: true
        }
      : undefined
  );
  gameRoot.append(join.element);
}

start().catch(showStartupError);
