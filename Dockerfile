FROM node:22.23.2-alpine AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN corepack enable && pnpm install --frozen-lockfile

FROM node:22.23.2-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY src ./src

RUN corepack enable && pnpm build

FROM node:22.23.2-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/entrypoints/http/server.js"]

