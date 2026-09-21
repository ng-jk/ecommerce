FROM php:8.5-fpm-alpine AS base
RUN apk add --no-cache libpq icu-libs libzip oniguruma \
    && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS postgresql-dev icu-dev libzip-dev oniguruma-dev \
    && docker-php-ext-install -j4 pdo_pgsql intl zip mbstring \
    && apk del .build-deps
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
COPY backend/ .
FROM base AS development
RUN composer install --no-interaction --prefer-dist \
    && touch .env \
    && chown -R www-data:www-data storage bootstrap/cache
CMD ["php-fpm"]
FROM base AS production
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && chown -R www-data:www-data storage bootstrap/cache
USER www-data
CMD ["php-fpm"]
