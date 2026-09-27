<?php

return [
    'default' => 'functiongemma',
    'providers' => [
        'functiongemma' => [
            'driver' => 'openai-compatible',
            'url' => rtrim(env('FUNCTIONGEMMA_URL', 'http://functiongemma:8000'), '/').'/v1',
            'models' => ['text' => ['default' => 'google/functiongemma-270m-it']],
        ],
    ],
];
