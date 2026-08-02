import type { PlayerSnapshot } from '@jinshi-territory/shared';

export class Minimap {
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.width = 308;
    canvas.height = 308;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.context = context;
  }

  render(players: PlayerSnapshot[], selfId: string, arenaRadius: number): void {
    const { context, canvas } = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(5,10,25,.9)';
    context.beginPath();
    context.arc(154, 154, 150, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255,100,130,.65)';
    context.lineWidth = 4;
    context.stroke();
    for (const player of players) {
      if (!player.alive) continue;
      const x = 154 + (player.x / arenaRadius) * 145;
      const y = 154 + (player.y / arenaRadius) * 145;
      context.fillStyle =
        player.id === selfId ? '#ffffff' : `#${player.color.toString(16).padStart(6, '0')}`;
      context.beginPath();
      context.arc(x, y, player.id === selfId ? 5 : 3, 0, Math.PI * 2);
      context.fill();
    }
  }
}
