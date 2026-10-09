FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/fashion/package.json ./frontend/fashion/package.json
COPY frontend/electronics/package.json ./frontend/electronics/package.json
COPY frontend/admin/package.json ./frontend/admin/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/storefront/package.json ./packages/storefront/package.json
COPY packages/merchant-plugins/package.json ./packages/merchant-plugins/package.json
COPY packages/miniapps/package.json ./packages/miniapps/package.json
RUN npm ci
COPY frontend/ ./frontend/
COPY packages/ ./packages/
ARG APP
ARG EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN=""
ENV EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN=$EXPO_PUBLIC_MINIAPP_ASSET_ORIGIN
RUN npm run export:web --workspace=@portfolio/${APP} -- --max-workers 2
FROM nginx:1.28-alpine
ARG APP
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/web/40-shop3i-runtime.sh /docker-entrypoint.d/40-shop3i-runtime.sh
COPY --from=build /app/frontend/${APP}/dist /usr/share/nginx/html
