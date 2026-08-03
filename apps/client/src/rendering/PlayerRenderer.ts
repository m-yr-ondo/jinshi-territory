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
      view.label.position.set(player.x, player.y - 32);
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
    body.roundRect(-17, -17, 34, 34, 9).fill({ color: skin.color, alpha: 0.17 });
    body.roundRect(-14, -7, 28, 28, 6).fill({ color: darken(skin.color, 0.5), alpha: 0.9 });
    body.roundRect(-14, -14, 28, 28, 6).fill({ color: skin.color });
    body.circle(-6, -7, 4).fill({ color: 0xffffff, alpha: 0.23 });
    body.circle(8, -6, 2.6).fill({ color: 0xffffff });
    body.circle(8, 6, 2.6).fill({ color: 0xffffff });
    body.circle(9, -6, 1.1).fill({ color: 0x080808 });
    body.circle(9, 6, 1.1).fill({ color: 0x080808 });
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
    const tracePath = () => {
      graphics.moveTo(first.x, first.y);
      for (const point of player.trail.slice(1)) graphics.lineTo(point.x, point.y);
      graphics.lineTo(player.x, player.y);
    };
    tracePath();
    graphics.stroke({
      color: player.color,
      width: GAME.trailWidth + 14,
      cap: 'round',
      join: 'round',
      alpha: 0.2
    });
    tracePath();
    graphics.stroke({
      color: player.color,
      width: GAME.trailWidth,
      cap: 'round',
      join: 'round',
      alpha: 1
    });
  }
}

function darken(color: number, factor: number): number {
  const red = Math.round(((color >> 16) & 0xff) * factor);
  const green = Math.round(((color >> 8) & 0xff) * factor);
  const blue = Math.round((color & 0xff) * factor);
  return (red << 16) | (green << 8) | blue;
}
