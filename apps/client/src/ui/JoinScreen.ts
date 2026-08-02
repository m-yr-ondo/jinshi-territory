import {
  DEFAULT_PLAYER_SKIN_ID,
  PLAYER_SKINS,
  isPlayerSkinId,
  type JoinOptions,
  type PlayerSkinDefinition
} from '@jinshi-territory/shared';

const SKIN_STORAGE_KEY = 'jinshi-territory-skin';

export interface JoinIdentity {
  playerId: string;
  displayName: string;
  guildId?: string;
  channelId?: string;
  locked?: boolean;
}

export class JoinScreen {
  readonly element = document.createElement('div');
  private readonly nameInput = document.createElement('input');
  private readonly button = document.createElement('button');
  private readonly error = document.createElement('p');
  private readonly choices = document.createElement('div');
  private selectedSkinId = storedSkinId();

  constructor(
    private readonly onJoin: (options: JoinOptions) => Promise<void>,
    private readonly identity?: JoinIdentity
  ) {
    this.element.className = 'join-screen';
    this.nameInput.id = 'display-name';
    this.nameInput.maxLength = 24;
    this.nameInput.placeholder = 'Enter your name';
    this.nameInput.value =
      identity?.displayName ?? localStorage.getItem('jinshi-territory-name') ?? '';
    this.nameInput.disabled = identity?.locked ?? false;
    this.button.className = 'primary';
    this.button.textContent = 'Claim the arena';
    this.error.className = 'join-error';
    this.choices.className = 'skin-grid';
    this.renderChoices();

    const card = document.createElement('div');
    card.className = 'join-card';
    card.innerHTML = `
      <div class="logo-mark" aria-hidden="true"><span></span><span></span><span></span></div>
      <h1>Jinshi Territory</h1>
      <p class="tagline">Draw. Capture. Cut them off.</p>`;
    const label = document.createElement('label');
    label.className = 'field';
    label.htmlFor = this.nameInput.id;
    label.innerHTML = '<span>Display name</span>';
    label.append(this.nameInput);
    const skinLabel = document.createElement('p');
    skinLabel.className = 'skin-label';
    skinLabel.textContent = 'Choose your color';
    card.append(label, skinLabel, this.choices, this.button, this.error);

    const hint = document.createElement('p');
    hint.className = 'controls-hint';
    hint.textContent = 'Steer with your mouse, touch, WASD or arrow keys';
    this.element.append(card, hint);
    this.button.addEventListener('click', () => void this.submit());
    this.nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.submit();
    });
  }

  private renderChoices(): void {
    this.choices.replaceChildren(...PLAYER_SKINS.map((skin) => this.skinButton(skin)));
  }

  private skinButton(skin: PlayerSkinDefinition): HTMLButtonElement {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = `skin-choice${skin.id === this.selectedSkinId ? ' selected' : ''}`;
    choice.title = skin.name;
    choice.setAttribute('aria-label', `Choose ${skin.name}`);
    choice.setAttribute('aria-pressed', String(skin.id === this.selectedSkinId));
    choice.style.setProperty('--skin-color', colorHex(skin.color));
    choice.style.setProperty('--skin-accent', colorHex(skin.accent));
    choice.innerHTML = '<span class="skin-cube"><i></i><i></i></span>';
    choice.addEventListener('click', () => {
      this.selectedSkinId = skin.id;
      this.renderChoices();
    });
    return choice;
  }

  private async submit(): Promise<void> {
    const displayName = this.nameInput.value.trim();
    if (!displayName) {
      this.error.textContent = 'Enter a display name.';
      return;
    }
    this.button.disabled = true;
    this.button.textContent = 'Connecting…';
    this.error.textContent = '';
    const playerId = this.identity?.playerId ?? getPlayerId();
    if (!this.identity?.locked) localStorage.setItem('jinshi-territory-name', displayName);
    localStorage.setItem(SKIN_STORAGE_KEY, this.selectedSkinId);
    try {
      await this.onJoin({
        playerId,
        displayName,
        skinId: this.selectedSkinId,
        ...(this.identity?.guildId ? { guildId: this.identity.guildId } : {}),
        ...(this.identity?.channelId ? { channelId: this.identity.channelId } : {})
      });
      this.element.style.display = 'none';
    } catch (error) {
      this.error.textContent = error instanceof Error ? error.message : 'Could not join the arena.';
      this.button.disabled = false;
      this.button.textContent = 'Claim the arena';
    }
  }
}

function storedSkinId(): string {
  const stored = localStorage.getItem(SKIN_STORAGE_KEY);
  return isPlayerSkinId(stored) ? stored : DEFAULT_PLAYER_SKIN_ID;
}

function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function getPlayerId(): string {
  const stored = localStorage.getItem('jinshi-territory-player-id');
  if (stored) return stored;
  const created = `local_${crypto.randomUUID().replaceAll('-', '')}`;
  localStorage.setItem('jinshi-territory-player-id', created);
  return created;
}
