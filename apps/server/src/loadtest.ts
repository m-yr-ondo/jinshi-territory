import { Client } from '@colyseus/sdk';
import {
  MESSAGE,
  type WelcomeMessage,
  type WorldDelta,
  type WorldInit
} from '@jinshi-territory/shared';

const endpoint = process.env.LOADTEST_URL ?? 'http://127.0.0.1:2570';
const clients = Number(process.env.LOADTEST_CLIENTS ?? 4);
const durationMs = Number(process.env.LOADTEST_DURATION_MS ?? 10_000);

const rooms = await Promise.all(
  Array.from({ length: clients }, async (_, index) => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate('territory', {
      playerId: `loadtest_${index}_${Date.now()}`,
      displayName: `Load ${index + 1}`
    });
    room.onMessage(MESSAGE.worldInit, (_message: WorldInit) => undefined);
    room.onMessage(MESSAGE.worldDelta, (_message: WorldDelta) => undefined);
    room.onMessage(MESSAGE.welcome, (_message: WelcomeMessage) => undefined);
    room.send(MESSAGE.ready);
    return room;
  })
);

let sequence = 0;
const timer = setInterval(() => {
  sequence += 1;
  rooms.forEach((room, index) =>
    room.send(MESSAGE.movement, {
      sequence,
      angle: sequence / 25 + (index / rooms.length) * Math.PI * 2,
      clientTime: Date.now()
    })
  );
}, 1000 / 30);

await new Promise((resolve) => setTimeout(resolve, durationMs));
clearInterval(timer);
await Promise.all(rooms.map((room) => room.leave()));
console.log(`Load test completed: ${clients} clients for ${durationMs} ms.`);
