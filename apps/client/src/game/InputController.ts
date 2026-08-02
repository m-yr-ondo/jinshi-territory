export class InputController {
  targetAngle = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('pointermove', this.onPointer);
    canvas.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointer);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private readonly onPointer = (event: PointerEvent) => {
    const bounds = this.canvas.getBoundingClientRect();
    this.targetAngle = Math.atan2(
      event.clientY - bounds.top - bounds.height / 2,
      event.clientX - bounds.left - bounds.width / 2
    );
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const angles: Partial<Record<string, number>> = {
      ArrowRight: 0,
      KeyD: 0,
      ArrowDown: Math.PI / 2,
      KeyS: Math.PI / 2,
      ArrowLeft: Math.PI,
      KeyA: Math.PI,
      ArrowUp: -Math.PI / 2,
      KeyW: -Math.PI / 2
    };
    const angle = angles[event.code];
    if (angle === undefined) return;
    event.preventDefault();
    this.targetAngle = angle;
  };
}
