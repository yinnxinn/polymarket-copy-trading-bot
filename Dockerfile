# Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV CI=true

COPY package.json package-lock.json ./
# postinstall only prints setup hints; src/ is not copied yet
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# Production stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Allow runtime append to changeme.md (leaderboard snapshots)
RUN touch /app/changeme.md && chown -R node:node /app

USER node

CMD ["node", "dist/index.js"]
