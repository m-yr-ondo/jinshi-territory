export class AudioManager {
  private context?: AudioContext;
  private muted = false;
  private lastGrowAt = 0;

  unlock(): void {
    this.context ??= new AudioContext();
    void this.context.resume();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  playGrow(): void {
    const now = performance.now();
    if (now - this.lastGrowAt < 100) return;
    this.lastGrowAt = now;
    this.tone(520, 0.035, 0.025, 'sine', 720);
  }

  playDeath(): void {
    this.tone(170, 0.32, 0.09, 'sawtooth', 55);
  }

  private tone(
    startFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency: number
  ): void {
    if (this.muted || !this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
