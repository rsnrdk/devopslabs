# Stage 1: install all dependencies and compile TypeScript
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Stage 2: small runtime image with only production dependencies
FROM node:24-alpine
# Version shown by the app (/version and on the page); set it with --build-arg APP_VERSION=1.0.0
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.version=${APP_VERSION}
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# never run as root inside the container
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
