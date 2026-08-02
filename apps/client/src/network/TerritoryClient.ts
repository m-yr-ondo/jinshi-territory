import { Client, type Room } from '@colyseus/sdk';
import {
  MESSAGE,
  type DeathMessage,
  type JoinOptions,
  type PlayerMovementMessage,
  type WelcomeMessage,
  type WorldDelta,
  type WorldInit
} from '@jinshi-territory/shared';

export interface TerritoryClientEvents {
  welcome: (message: WelcomeMessage) => void;
  worldInit: (message: WorldInit) => void;
  worldDelta: (message: WorldDelta) => void;
  death: (message: DeathMessage) => void;
  disconnected: (code: number) => void;
}

export class TerritoryClient {
  private room: Room | undefined;
  private readonly client: Client;

  constructor(
    endpoint: string,
    authToken: string | undefined,
    private readonly events: TerritoryClientEvents
  ) {
    this.client = new Client(
      endpoint,
      endpoint.startsWith('/') ? { urlBuilder: (url) => url.toString() } : undefined
    );
    if (authToken) this.client.auth.token = authToken;
  }

  async join(options: JoinOptions): Promise<void> {
    this.room = await this.client.joinOrCreate('territory', options);
    this.room.onMessage(MESSAGE.welcome, this.events.welcome);
    this.room.onMessage(MESSAGE.worldInit, this.events.worldInit);
    this.room.onMessage(MESSAGE.worldDelta, this.events.worldDelta);
    this.room.onMessage(MESSAGE.death, this.events.death);
    this.room.onLeave((code) => this.events.disconnected(code));
    this.room.send(MESSAGE.ready);
  }

  sendMovement(movement: PlayerMovementMessage): void {
    this.room?.send(MESSAGE.movement, movement);
  }
}
