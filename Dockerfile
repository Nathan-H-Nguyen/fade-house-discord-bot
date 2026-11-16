FROM node:26-slim

ENV NODE_ENV=production \
    DATABASE_PATH=/data/fade-house.db

WORKDIR /app

COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries; skipping install scripts stops npm compiling it from source.
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src

RUN mkdir /data && chown node:node /data
USER node
VOLUME /data

# Run node directly, not through npm, so SIGTERM reaches the bot and it shuts down cleanly.
CMD ["node", "src/main.ts"]
