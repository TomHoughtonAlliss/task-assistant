FROM node:22.23.2-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm prune --prod

FROM node:22.23.2-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps

RUN corepack enable && mkdir -p /app/data

EXPOSE 3000

CMD ["pnpm", "--filter", "@task-assistant/http", "start"]
