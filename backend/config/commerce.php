<?php

return [
    'rate_limit' => (int) env('COMMERCE_RATE_LIMIT', 300),
    'auth_rate_limit' => (int) env('AUTH_RATE_LIMIT', 10),
    // Restrictions apply to both REST and assistant calls. Existing security guards remain mandatory.
    'actions' => [
        'catalog' => ['enabled' => true, 'roles' => ['guest', 'customer', 'admin']],
        'product' => ['enabled' => true, 'roles' => ['guest', 'customer', 'admin']],
        'auth.login' => ['enabled' => true, 'roles' => ['guest', 'customer', 'admin']],
        'auth.register' => ['enabled' => true, 'roles' => ['guest', 'customer', 'admin']],
        'auth.me' => ['enabled' => true, 'roles' => ['customer', 'admin']],
        'auth.logout' => ['enabled' => true, 'roles' => ['customer', 'admin']],
        'cart.read' => ['enabled' => true, 'roles' => ['customer', 'admin']],
        'cart.update' => ['enabled' => true, 'roles' => ['customer', 'admin']],
        'checkout' => ['enabled' => true, 'roles' => ['customer', 'admin']],
        'orders' => ['enabled' => true, 'roles' => ['customer', 'admin']],
        'admin.products' => ['enabled' => true, 'roles' => ['admin']],
        'admin.create' => ['enabled' => true, 'roles' => ['admin']],
        'admin.update' => ['enabled' => true, 'roles' => ['admin']],
        'admin.product' => ['enabled' => true, 'roles' => ['admin']],
        'admin.delete' => ['enabled' => true, 'roles' => ['admin']],
        'admin.orders' => ['enabled' => true, 'roles' => ['admin']],
        'admin.advance' => ['enabled' => true, 'roles' => ['admin']],
    ],
];
