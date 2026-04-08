# Deployment Guide

This guide covers deploying the Polymarket Copy Trading Bot to production environments.

## Prerequisites

- Node.js 18+
- MongoDB database (local or MongoDB Atlas)
- Polygon wallet with USDC and POL
- RPC endpoint (Infura, Alchemy, or custom)

## Deployment Options

### Direct Node.js Deployment

#### On Linux Server (systemd)

1. **Install dependencies:**

```bash
npm ci --production
npm run build
```

2. **Create systemd service** (`/etc/systemd/system/polymarket-bot.service`):

```ini
[Unit]
Description=Polymarket Copy Trading Bot
After=network.target mongod.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/polymarket-copy-trading-bot
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

3. **Enable and start:**

```bash
sudo systemctl enable polymarket-bot
sudo systemctl start polymarket-bot
sudo systemctl status polymarket-bot
```

4. **View logs:**

```bash
sudo journalctl -u polymarket-bot -f
```

#### On VPS (PM2)

1. **Install PM2:**

```bash
npm install -g pm2
```

2. **Start application:**

```bash
npm run build
pm2 start dist/index.js --name polymarket-bot
pm2 save
pm2 startup
```

3. **Monitor:**

```bash
pm2 status
pm2 logs polymarket-bot
pm2 monit
```

### Docker Compose

Use this when you prefer containers instead of installing Node.js on the server. The stack includes the **bot** and a **local MongoDB 7** service with a persistent volume. You still configure trading secrets exactly like [GETTING_STARTED.md](./GETTING_STARTED.md) (wallet, RPC, Polymarket endpoints, traders to copy).

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2 (`docker compose`).

**1. Configure environment**

```bash
cp .env.example .env
# Edit .env: USER_ADDRESSES, PROXY_WALLET, PRIVATE_KEY (64 hex chars), RPC_URL,
# CLOB_HTTP_URL, CLOB_WS_URL, USDC_CONTRACT_ADDRESS
```

**2. MongoDB — choose one**

| Mode | What to do |
|------|------------|
| **Bundled MongoDB** (default in this compose file) | Do not set `MONGO_URI` in `.env`, or use the default `mongodb://mongo:27017/polymarket_copytrading` shown in `docker-compose.yml`. Data is stored in the `mongo_data` volume. |
| **MongoDB Atlas** | Set `MONGO_URI` in `.env` to your Atlas connection string. Start **only** the bot so the local `mongo` container is not used: `docker compose up -d --build --no-deps bot` |

**3. (Recommended) Health check before going live**

The image runs compiled JavaScript only (`dist/`). Run the same check as `npm run health-check` with:

```bash
docker compose build bot
# With bundled MongoDB (starts mongo + one-off bot):
docker compose run --rm bot node dist/scripts/healthCheck.js
# With MongoDB Atlas only (no local mongo container):
docker compose run --rm --no-deps bot node dist/scripts/healthCheck.js
```

**4. Start services**

```bash
docker compose up -d --build
```

**5. Logs and lifecycle**

```bash
docker compose logs -f bot
docker compose stop
docker compose down          # removes containers; use `down -v` to also drop Mongo volume
```

**Notes**

- **Scripts** such as `npm run check-stats` use `ts-node` and are not installed in the production image. For one-off maintenance, run Node on the host with a dev install, or extend the Dockerfile with a dev stage.
- **Resources:** align with [Performance Tuning](#performance-tuning) in this file (similar CPU/RAM expectations).
- **Security:** restrict `.env` permissions (`chmod 600 .env` on Linux); do not commit `.env`.

Equivalent **npm** shortcuts (from project root):

```bash
npm run docker:up
npm run docker:health          # or npm run docker:health:atlas if using Atlas only
npm run docker:logs
npm run docker:down
```

## Environment Configuration

### Required Variables

Ensure all required variables are set in `.env`:

- `USER_ADDRESSES` - Traders to copy
- `PROXY_WALLET` - Your trading wallet
- `PRIVATE_KEY` - Wallet private key
- `MONGO_URI` - MongoDB connection string
- `RPC_URL` - Polygon RPC endpoint
- `CLOB_HTTP_URL` - Polymarket CLOB HTTP endpoint
- `CLOB_WS_URL` - Polymarket CLOB WebSocket endpoint
- `USDC_CONTRACT_ADDRESS` - USDC contract on Polygon

### Security Best Practices

1. **Never commit `.env` file** - It's already in `.gitignore`
2. **Use environment variables in production** - Don't store secrets in files
3. **Restrict file permissions:**

```bash
chmod 600 .env
```

4. **Use secrets management** - Consider using:
    - AWS Secrets Manager
    - HashiCorp Vault
    - Kubernetes Secrets

## Health Checks

### Manual Health Check

```bash
npm run health-check
```

### Automated Monitoring

Set up monitoring to check:

1. **Process status** - Is the bot running?
2. **Health check endpoint** - (if implemented)
3. **MongoDB connection** - Database connectivity
4. **RPC endpoint** - Blockchain connectivity
5. **USDC balance** - Sufficient funds

### Example Monitoring Script

```bash
#!/bin/bash
# health-monitor.sh

if ! pgrep -f "node.*dist/index.js" > /dev/null; then
    echo "Bot process not running!"
    # Restart or alert
fi

npm run health-check || echo "Health check failed!"
```

## Logging

### Log Locations

- **systemd:** `journalctl -u polymarket-bot`
- **PM2:** `pm2 logs polymarket-bot`

### Log Rotation

Configure log rotation to prevent disk space issues:

```bash
# /etc/logrotate.d/polymarket-bot
/path/to/polymarket-bot/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

## Backup and Recovery

### MongoDB Backup

```bash
# Backup
mongodump --uri="mongodb://localhost:27017/polymarket_copytrading" --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://localhost:27017/polymarket_copytrading" /backup/20240101
```

## Scaling Considerations

### Single Instance

- Suitable for personal use
- Handles multiple traders
- Simple deployment

### Multiple Instances (Advanced)

⚠️ **Warning:** Running multiple instances requires careful coordination:

- Use distributed locking (Redis)
- Ensure only one instance processes trades
- Coordinate MongoDB access
- Consider message queue (RabbitMQ, Redis)

## Troubleshooting

### Bot Not Starting

1. Check environment variables:

```bash
npm run health-check
```

2. Verify MongoDB connection:

```bash
mongosh "mongodb://your-connection-string"
```

3. Check RPC endpoint:

```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $RPC_URL
```

### Trades Not Executing

1. Check USDC balance:

```bash
npm run check-allowance
```

2. Verify trader addresses are active
3. Check logs for errors
4. Ensure sufficient POL for gas

### High Memory Usage

- Reduce `FETCH_INTERVAL` if too low
- Limit number of traders
- Monitor MongoDB connection pool
- Consider increasing Node.js memory limit:

```bash
NODE_OPTIONS="--max-old-space-size=2048" node dist/index.js
```

## Updates and Maintenance

### Updating the Bot

1. **Pull latest changes:**

```bash
git pull origin main
```

2. **Rebuild:**

```bash
npm ci
npm run build
```

3. **Restart:**

```bash
# systemd
sudo systemctl restart polymarket-bot

# PM2
pm2 restart polymarket-bot
```

### Zero-Downtime Updates

For production, use rolling updates:

1. Deploy new version alongside old
2. Verify health
3. Switch traffic
4. Stop old version

## Performance Tuning

### Recommended Settings

- **FETCH_INTERVAL:** 1-3 seconds (balance speed vs API load)
- **RETRY_LIMIT:** 3 (sufficient for transient errors)
- **REQUEST_TIMEOUT_MS:** 10000 (10 seconds)

### Resource Requirements

- **CPU:** 1-2 cores
- **RAM:** 512MB - 1GB
- **Disk:** 10GB (for MongoDB data)
- **Network:** Stable connection to Polygon RPC

## Security Checklist

- [ ] `.env` file has restricted permissions (600)
- [ ] Private keys are not logged
- [ ] MongoDB is not exposed to public internet
- [ ] RPC endpoint uses HTTPS
- [ ] Regular security updates applied
- [ ] Firewall configured (if applicable)
- [ ] Monitoring and alerting set up

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review logs for error messages
3. Run health check: `npm run health-check`
4. Open GitHub issue with:
    - Error logs
    - Configuration (redacted)
    - Steps to reproduce
