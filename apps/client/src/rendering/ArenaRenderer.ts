import { Container, Graphics } from 'pixi.js';

export class ArenaRenderer {
  readonly container = new Container();

  constructor(radius: number) {
    const graphics = new Graphics();
    graphics.circle(0, 0, radius + 34).fill({ color: 0x000000 });
    graphics.circle(0, 0, radius).fill({ color: 0x000000 });
    graphics.circle(0, 0, radius).stroke({ color: 0x252525, width: 12, alpha: 0.9 });
    graphics.circle(0, 0, radius + 9).stroke({ color: 0x080808, width: 18, alpha: 1 });
    this.container.addChild(graphics);
  }
}
