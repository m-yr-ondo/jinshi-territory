import { GAME } from './constants.js';
import type { Vec2 } from './entities.js';

export const TAU = Math.PI * 2;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  let result = angle % TAU;
  if (result > Math.PI) result -= TAU;
  if (result < -Math.PI) result += TAU;
  return result;
}

export function rotateTowards(current: number, target: number, maximumDelta: number): number {
  const delta = normalizeAngle(target - current);
  return normalizeAngle(current + clamp(delta, -maximumDelta, maximumDelta));
}

export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function advancePlayer(
  state: Vec2 & { angle: number },
  targetAngle: number,
  deltaSeconds: number
): Vec2 & { angle: number } {
  const angle = rotateTowards(
    state.angle,
    targetAngle,
    GAME.maximumTurnRate * Math.max(0, deltaSeconds)
  );
  return {
    x: state.x + Math.cos(angle) * GAME.playerSpeed * deltaSeconds,
    y: state.y + Math.sin(angle) * GAME.playerSpeed * deltaSeconds,
    angle
  };
}

export function finiteMovement(value: unknown): value is { angle: number; sequence: number } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { angle?: unknown; sequence?: unknown };
  return Number.isFinite(candidate.angle) && Number.isInteger(candidate.sequence);
}

export function interpolateAngle(before: number, after: number, ratio: number): number {
  return before + normalizeAngle(after - before) * ratio;
}
