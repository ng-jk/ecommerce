<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CustomPaymentController;
use App\Http\Controllers\OperationController;
use App\Http\Controllers\PaymentWebhookController;
use App\Http\Controllers\StripeWebhookController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/shops/{shop:slug}')->middleware('throttle:'.config('commerce.rate_limit').',1,commerce-')->group(function (): void {
    Route::post('assistant', [OperationController::class, 'submit'])->name('assistant')->middleware('throttle:'.config('assistant.rate_limit').',1,assistant-');
    Route::get('operations/{id}', [OperationController::class, 'show']);
    Route::get('products', [OperationController::class, 'submit'])->name('catalog');
    Route::get('products/{id}', [OperationController::class, 'submit'])->name('product');
    Route::post('auth/register', [OperationController::class, 'submit'])->name('auth.register')->middleware('throttle:'.config('commerce.auth_rate_limit').',1,auth-');
    Route::post('auth/login', [OperationController::class, 'submit'])->name('auth.login')->middleware('throttle:'.config('commerce.auth_rate_limit').',1,auth-');
    Route::middleware(['auth:sanctum', 'shop.access'])->group(function (): void {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [OperationController::class, 'submit'])->name('auth.logout');
        foreach ([['get', 'cart', 'cart.read'], ['put', 'cart', 'cart.update'], ['post', 'checkout', 'checkout'], ['get', 'orders', 'orders'], ['get', 'admin/products', 'admin.products'], ['get', 'admin/products/{id}', 'admin.product'], ['post', 'admin/products', 'admin.create'], ['patch', 'admin/products/{id}', 'admin.update'], ['delete', 'admin/products/{id}', 'admin.delete'], ['get', 'admin/orders', 'admin.orders'], ['patch', 'admin/orders/{id}', 'admin.advance'], ['get', 'admin/plugins', 'admin.plugins'], ['get', 'admin/plugins/{id}', 'admin.plugin'], ['post', 'admin/plugins', 'admin.plugin.install'], ['patch', 'admin/plugins/{id}', 'admin.plugin.update'], ['get', 'plugins/loyalty/balance', 'plugin.loyalty.balance'], ['post', 'admin/plugins/loyalty/credit', 'admin.plugin.loyalty.credit']] as [$method,$path,$action]) {
            Route::$method($path, [OperationController::class, 'submit'])->name($action);
        }
    });
});

Route::post('v1/payments/billplz/{reference}', PaymentWebhookController::class)->whereUuid('reference')->middleware('throttle:120,1,billplz-');
Route::post('v1/payments/stripe', StripeWebhookController::class)->middleware('throttle:120,1,stripe-');
Route::prefix('v1/payment-integrations/{integration}')->where(['integration' => '[a-z][a-z0-9_-]{0,79}'])->middleware('throttle:120,1,custom-payment-')->group(function (): void {
    Route::post('confirm', [CustomPaymentController::class, 'confirm']);
    Route::get('{event}', [CustomPaymentController::class, 'show'])->whereNumber('event');
});
