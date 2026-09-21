FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/fashion/package.json ./frontend/fashion/package.json
COPY frontend/electronics/package.json ./frontend/electronics/package.json
COPY frontend/admin/package.json ./frontend/admin/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/storefront/package.json ./packages/storefront/package.json
RUN npm ci
COPY frontend/ ./frontend/
COPY packages/ ./packages/
ARG APP
RUN npm run export:web --workspace=@portfolio/${APP} -- --max-workers 2
FROM nginx:1.28-alpine
ARG APP
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/${APP}/dist /usr/share/nginx/html
