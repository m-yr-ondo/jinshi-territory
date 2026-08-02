import type { DeathMessage } from '@jinshi-territory/shared';

export class DeathScreen {
  readonly element = document.createElement('div');
  private readonly detail = document.createElement('p');
  private readonly countdown = document.createElement('p');
  private respawnAt = 0;

  constructor() {
    this.element.className = 'death-screen';
    const card = document.createElement('div');
    card.className = 'death-card panel';
    card.innerHTML = '<h2>Cut off!</h2>';
    card.append(this.detail, this.countdown);
    this.element.append(card);
  }

  show(message: DeathMessage): void {
    this.respawnAt = message.respawnAt;
    this.detail.textContent = message.killerName
      ? `${message.killerName} crossed your trail.`
      : `Cause: ${message.reason.replaceAll('-', ' ')}`;
    this.element.classList.add('visible');
  }

  update(now: number, alive: boolean): void {
    if (alive) {
      this.element.classList.remove('visible');
      return;
    }
    if (!this.respawnAt) return;
    this.countdown.textContent = `Respawning in ${Math.max(0, (this.respawnAt - now) / 1000).toFixed(1)}s`;
  }
}
