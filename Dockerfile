FROM node:26-slim AS build
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.12.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm install --frozen-lockfile --prod

FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./
COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME /app/data

ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "src/index.js"]
