<?php

return [
    'asset_origin' => rtrim((string) env('MINIAPP_ASSET_ORIGIN', ''), '/'),
    'parent_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('MINIAPP_PARENT_ORIGINS', ''))))),
    'approver_user_ids' => array_values(array_filter(array_map('intval', explode(',', (string) env('MINIAPP_APPROVER_USER_IDS', ''))))),
    'capabilities' => ['catalog', 'product', 'cart.read', 'orders', 'plugin.loyalty.balance'],
];
