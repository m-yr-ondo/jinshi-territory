# Jinshi Territory

Jinshi Territory is a real-time multiplayer territory-capture arena inspired by the risk-and-reward loop of Paper.io 2. It is designed for Discord Activities and also runs locally in a normal browser.

Players leave safe territory to draw a vulnerable trail. Returning home closes the loop and claims the enclosed land; crossing another player's exposed trail eliminates them.

## Features

- Server-authoritative multiplayer movement and captures
- Shared circular arena with 12 autonomous bots
- Territory stealing, trail cutting, respawning and percentage scoring
- Mouse, touch, WASD and arrow-key controls
- Twelve original color presets
- Discord Embedded App authentication backend
- Automatic arena cleanup after the last human leaves

## Run locally

Requires Node.js 22+ and npm 10+.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open <http://localhost:5175>. Open a second tab to test real multiplayer.

Discord credentials are not needed for local development. Local sessions use generated guest identities.

## Commands

```bash
npm run build
npm run typecheck
npm test
npm run lint
npm run test:e2e
```

## Architecture

- `apps/client`: Vite, PixiJS renderer, UI and Discord Embedded App SDK
- `apps/server`: Colyseus room, authoritative simulation, bots and OAuth exchange
- `packages/shared`: protocol types, movement rules, colors and constants
- `deploy`: example systemd and Nginx configuration

The server uses a fine territory grid for deterministic capture calculations. Clients receive versioned ownership maps only when territory changes, while player motion is streamed continuously.

See [game rules](docs/GAME_RULES.md), [networking](docs/NETWORKING.md) and [deployment](docs/DEPLOYMENT.md).

## License

MIT. All code and procedural visuals are original. Paper.io and Paper.io 2 are trademarks of their respective owners; this project contains none of their assets or source code.
