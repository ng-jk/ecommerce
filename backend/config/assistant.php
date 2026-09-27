<?php

return [
    'url' => env('FUNCTIONGEMMA_URL', 'http://functiongemma:8000'),
    'timeout' => 25,
    'ttl_minutes' => 30,
    'rate_limit' => (int) env('ASSISTANT_RATE_LIMIT', 30),
];
