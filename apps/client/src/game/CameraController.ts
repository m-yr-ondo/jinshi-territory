import type { PlayerSnapshot } from '@jinshi-territory/shared';

export class CameraController {
  x = 0;
  y = 0;
  zoom = 0.82;

  update(player: PlayerSnapshot | undefined, deltaSeconds: number): void {
    if (!player) return;
    const smoothing = 1 - Math.exp(-8 * deltaSeconds);
    this.x += (player.x - this.x) * smoothing;
    this.y += (player.y - this.y) * smoothing;
    const targetZoom = 0.82;
    this.zoom += (targetZoom - this.zoom) * smoothing;
  }
}
