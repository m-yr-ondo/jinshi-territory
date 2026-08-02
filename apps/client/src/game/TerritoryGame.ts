import { GAME, type DeathMessage, type JoinOptions } from '@jinshi-territory/shared';
import { Application, Container } from 'pixi.js';
import { AudioManager } from '../audio/AudioManager.js';
import { TerritoryClient } from '../network/TerritoryClient.js';
import { ArenaRenderer } from '../rendering/ArenaRenderer.js';
import { PlayerRenderer } from '../rendering/PlayerRenderer.js';
import { TerritoryRenderer } from '../rendering/TerritoryRenderer.js';
import { DeathScreen } from '../ui/DeathScreen.js';
import { Leaderboard } from '../ui/Leaderboard.js';
import { Minimap } from '../ui/Minimap.js';
import { CameraController } from './CameraController.js';
import { InputController } from './InputController.js';
import { WorldModel } from './WorldModel.js';

export class TerritoryGame {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly camera = new CameraController();
  private readonly model = new WorldModel();
  private readonly audio = new AudioManager();
  private readonly arena = new ArenaRenderer(GAME.arenaRadius);
  private readonly territory = new TerritoryRenderer();
  private readonly players = new PlayerRenderer();
  private readonly network: TerritoryClient;
  private readonly leaderboard: Leaderboard;
  private readonly minimap: Minimap;
  private readonly deathScreen = new DeathScreen();
  private readonly hud: HTMLElement;
  private readonly connection: HTMLElement;
  private readonly territoryValue: HTMLElement;
  private readonly killsValue: HTMLElement;
  private input?: InputController;
  private selfId = '';
  private sequence = 0;
  private inputTimer?: number;
  private previousCells = 0;

  constructor(
    private readonly root: HTMLElement,
    endpoint: string,
    authToken?: string
  ) {
    this.hud = buildHud(root);
    this.connection = this.hud.querySelector('.connection') as HTMLElement;
    this.territoryValue = this.hud.querySelector('[data-territory]') as HTMLElement;
    this.killsValue = this.hud.querySelector('[data-kills]') as HTMLElement;
    this.leaderboard = new Leaderboard(this.hud.querySelector('.leaderboard') as HTMLElement);
    this.minimap = new Minimap(this.hud.querySelector('#minimap') as HTMLCanvasElement);
    this.hud.append(this.deathScreen.element);
    const mute = this.hud.querySelector('.mute') as HTMLButtonElement;
    mute.addEventListener('click', () => {
      mute.textContent = this.audio.toggle() ? '🔇' : '🔊';
    });
    this.network = new TerritoryClient(endpoint, authToken, {
      welcome: (message) => {
        this.selfId = message.playerId;
      },
      worldInit: (message) => {
        this.model.initialize(message);
        this.selfId = message.selfId;
        this.updateInterface(message.players);
      },
      worldDelta: (message) => {
        this.model.apply(message);
        this.updateInterface(message.players);
      },
      death: (message) => this.onDeath(message),
      disconnected: () => this.onDisconnected()
    });
  }

  async initialize(): Promise<void> {
    await this.app.init({
      resizeTo: this.root,
      background: 0x0c1020,
      antialias: true,
      resolution: Math.min(1.5, devicePixelRatio)
    });
    this.app.canvas.className = 'game-canvas';
    this.root.prepend(this.app.canvas);
    this.world.addChild(this.arena.container, this.territory.graphics, this.players.container);
    this.app.stage.addChild(this.world);
    this.input = new InputController(this.app.canvas);
    this.app.ticker.add((ticker) => this.render(ticker.deltaMS / 1000));
  }

  async join(options: JoinOptions): Promise<void> {
    this.audio.unlock();
    this.connection.textContent = 'Connecting…';
    await this.network.join(options);
    this.hud.classList.add('visible');
    this.connection.textContent = '● Connected';
    this.connection.classList.remove('bad');
    this.inputTimer = window.setInterval(() => this.sendMovement(), 1000 / GAME.tickRate);
  }

  private sendMovement(): void {
    if (!this.input || !this.selfId) return;
    this.network.sendMovement(this.model.movement(++this.sequence, this.input.targetAngle));
  }

  private updateInterface(players: Parameters<WorldModel['initialize']>[0]['players']): void {
    const self = players.find((player) => player.id === this.selfId);
    if (self && this.previousCells > 0 && self.territoryCells > this.previousCells + 2)
      this.audio.playGrow();
    this.previousCells = self?.territoryCells ?? 0;
    const percentage = self
      ? (self.territoryCells / Math.max(1, this.model.metadata.claimableCells)) * 100
      : 0;
    this.territoryValue.textContent = `${percentage.toFixed(1)}%`;
    this.killsValue.textContent = String(self?.kills ?? 0);
    this.leaderboard.render(this.model.metadata.leaderboard, this.selfId);
    this.minimap.render(players, this.selfId, this.model.arenaRadius || GAME.arenaRadius);
  }

  private onDeath(message: DeathMessage): void {
    this.audio.playDeath();
    this.deathScreen.show(message);
  }

  private onDisconnected(): void {
    this.connection.textContent = '● Disconnected — refresh to rejoin';
    this.connection.classList.add('bad');
    if (this.inputTimer) window.clearInterval(this.inputTimer);
  }

  private render(deltaSeconds: number): void {
    if (!this.selfId) return;
    const rendered = this.model.render(deltaSeconds, this.input?.targetAngle);
    const self = rendered.find((player) => player.id === this.selfId);
    this.camera.update(self, deltaSeconds);
    this.world.position.set(
      this.app.screen.width / 2 - this.camera.x * this.camera.zoom,
      this.app.screen.height / 2 - this.camera.y * this.camera.zoom
    );
    this.world.scale.set(this.camera.zoom);
    this.territory.render(
      this.model.territoryRevision,
      this.model.territory,
      this.model.colors,
      this.model.gridSize,
      this.model.cellSize
    );
    this.players.render(rendered, this.selfId);
    this.deathScreen.update(Date.now(), self?.alive ?? false);
  }
}

function buildHud(root: HTMLElement): HTMLElement {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="stats panel">
      <div class="stat"><span class="stat-label">Territory</span><span class="stat-value" data-territory>0.0%</span></div>
      <div class="stat"><span class="stat-label">Cuts</span><span class="stat-value" data-kills>0</span></div>
    </div>
    <div class="connection panel">Connecting…</div>
    <div class="leaderboard panel"></div>
    <div class="minimap-wrap panel"><canvas id="minimap"></canvas></div>
    <div class="game-tip panel">Close loops to claim land • Cross an enemy trail to eliminate them</div>
    <button class="mute" title="Toggle audio">🔊</button>`;
  root.append(hud);
  return hud;
}
