import { Container, Graphics } from 'pixi.js';

export class ArenaRenderer {
  readonly container = new Container();

  constructor(radius: number) {
    const graphics = new Graphics();
    graphics.circle(0, 0, radius + 34).fill({ color: 0x151a2b });
    graphics.circle(0, 0, radius).fill({ color: 0xf2f3f7 });
    for (let ring = 250; ring < radius; ring += 250)
      graphics.circle(0, 0, ring).stroke({ color: 0xb8bfcc, width: 2, alpha: 0.2 });
    graphics.circle(0, 0, radius).stroke({ color: 0xffffff, width: 12, alpha: 0.9 });
    graphics.circle(0, 0, radius + 9).stroke({ color: 0x343a52, width: 18, alpha: 0.9 });
    this.container.addChild(graphics);
  }
}
