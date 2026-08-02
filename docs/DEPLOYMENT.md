# Discord deployment

Local play requires no Discord configuration. Production requires:

```env
HOST=127.0.0.1
PORT=2570
CLIENT_ORIGIN=https://territory.example.com
MAX_HUMANS=32
NODE_ENV=production
DISCORD_CLIENT_ID=your_application_id
DISCORD_CLIENT_SECRET=your_client_secret
JWT_SECRET=a_random_64_character_secret
```

Before building the frontend, create `apps/client/.env.production`:

```env
VITE_DISCORD_CLIENT_ID=your_application_id
```

Build with `npm ci && npm run build`. The included examples expect:

- repository: `/home/ubuntu/jinshi-territory`
- static client: `/var/www/jinshi-territory`
- application port: `2570`
- Nginx port: `8082`
- public `/colyseus/` path proxying to the application

Install `deploy/jinshi-territory.service`, copy `deploy/nginx.conf` into an enabled Nginx site, and publish the Nginx origin through an HTTPS tunnel or reverse proxy.

In the Discord Developer Portal, enable Activities, map `/` to the public hostname, add the OAuth redirect required by the Embedded App SDK, and install the application with the `applications.commands` scope. Never commit `.env` or `.env.production`.
