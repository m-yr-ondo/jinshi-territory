import { GAME, playerSkin, type PlayerSnapshot } from '@jinshi-territory/shared';
import { Container, Graphics, Text } from 'pixi.js';

interface PlayerView {
  container: Container;
  trail: Graphics;
  head: Container;
  body: Graphics;
  label: Text;
}

export class PlayerRenderer {
  readonly container = new Container();
  private readonly views = new Map<string, PlayerView>();

  render(players: PlayerSnapshot[], selfId: string): void {
    const active = new Set<string>();
    for (const player of players) {
      active.add(player.id);
      const view = this.viewFor(player);
      view.container.visible = player.alive;
      if (!player.alive) continue;
      this.drawTrail(view.trail, player);
      view.head.position.set(player.x, player.y);
      view.head.rotation = player.angle;
      view.head.alpha = player.protected ? 0.58 + Math.sin(Date.now() / 90) * 0.18 : 1;
      view.label.text = player.id === selfId ? `${player.name} • you` : player.name;
      view.label.position.set(player.x, player.y - 27);
    }
    for (const [id, view] of this.views) {
      if (active.has(id)) continue;
      view.container.destroy({ children: true });
      this.views.delete(id);
    }
  }

  private viewFor(player: PlayerSnapshot): PlayerView {
    const existing = this.views.get(player.id);
    if (existing) return existing;
    const container = new Container();
    const trail = new Graphics();
    const head = new Container();
    const body = new Graphics();
    const skin = playerSkin(player.skinId);
    body.roundRect(-12, -12, 24, 24, 5).fill({ color: skin.color });
    body.roundRect(1, -9, 7, 18, 3).fill({ color: skin.accent, alpha: 0.75 });
    body.circle(7, -5, 2.3).fill({ color: 0xffffff });
    body.circle(7, 5, 2.3).fill({ color: 0xffffff });
    body.circle(8, -5, 1).fill({ color: 0x202538 });
    body.circle(8, 5, 1).fill({ color: 0x202538 });
    head.addChild(body);
    const label = new Text({
      text: player.name,
      style: {
        fill: 0xffffff,
        fontSize: 13,
        fontWeight: '700',
        stroke: { color: 0x24283a, width: 4 }
      }
    });
    label.anchor.set(0.5);
    container.addChild(trail, head, label);
    this.container.addChild(container);
    const view = { container, trail, head, body, label };
    this.views.set(player.id, view);
    return view;
  }

  private drawTrail(graphics: Graphics, player: PlayerSnapshot): void {
    graphics.clear();
    if (!player.drawing || player.trail.length === 0) return;
    const first = player.trail[0];
    if (!first) return;
    graphics.moveTo(first.x, first.y);
    for (const point of player.trail.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.lineTo(player.x, player.y);
    graphics.stroke({
      color: player.color,
      width: GAME.trailWidth,
      cap: 'round',
      join: 'round',
      alpha: 0.98
    });
    graphics.stroke({
      color: 0xffffff,
      width: 2,
      cap: 'round',
      join: 'round',
      alpha: 0.45
    });
  }
}
