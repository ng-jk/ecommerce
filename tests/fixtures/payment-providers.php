<?php

// Mounted only by compose.test.yaml; never copied into a backend image.
require __DIR__.'/payment-test-provider.php';

return [App\Providers\AppServiceProvider::class, PaymentTestProvider::class];
