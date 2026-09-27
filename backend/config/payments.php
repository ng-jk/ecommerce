<?php

return [
    'driver' => env('PAYMENT_DRIVER', 'stripe'),
    'drivers' => [],
    'enabled' => [],
    'custom' => [],
    'stripe' => [
        'secret' => env('STRIPE_SECRET_KEY', ''),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET', ''),
        'return_url' => env('STRIPE_RETURN_URL', ''),
        'sandbox' => env('STRIPE_SANDBOX', true),
    ],
    'sandbox' => env('BILLPLZ_SANDBOX', true),
    'api_key' => env('BILLPLZ_API_KEY', ''),
    'signature_key' => env('BILLPLZ_SIGNATURE_KEY', ''),
    'webhook_base' => env('PAYMENT_WEBHOOK_BASE_URL', ''),
    'collections' => [
        'fashion' => env('BILLPLZ_FASHION_COLLECTION_ID', ''),
        'electronics' => env('BILLPLZ_ELECTRONICS_COLLECTION_ID', ''),
    ],
    'returns' => [
        'fashion' => env('BILLPLZ_FASHION_RETURN_URL', ''),
        'electronics' => env('BILLPLZ_ELECTRONICS_RETURN_URL', ''),
    ],
];
