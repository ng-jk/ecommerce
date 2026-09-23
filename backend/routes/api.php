<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\OperationController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/shops/{shop:slug}')->middleware('throttle:300,1,commerce-')->group(function (): void {
    Route::post('assistant', [OperationController::class, 'submit'])->name('assistant')->middleware('throttle:10,1,assistant-');
    Route::get('operations/{id}', [OperationController::class, 'show']);
    Route::get('products', [OperationController::class, 'submit'])->name('catalog');
    Route::get('products/{id}', [OperationController::class, 'submit'])->name('product');
    Route::post('auth/register', [OperationController::class, 'submit'])->name('auth.register')->middleware('throttle:10,1,auth-');
    Route::post('auth/login', [OperationController::class, 'submit'])->name('auth.login')->middleware('throttle:10,1,auth-');
    Route::middleware(['auth:sanctum', 'shop.access'])->group(function (): void {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [OperationController::class, 'submit'])->name('auth.logout');
        foreach ([['get', 'cart', 'cart.read'], ['put', 'cart', 'cart.update'], ['post', 'checkout', 'checkout'], ['get', 'orders', 'orders'], ['get', 'admin/products', 'admin.products'], ['get', 'admin/products/{id}', 'admin.product'], ['post', 'admin/products', 'admin.create'], ['patch', 'admin/products/{id}', 'admin.update'], ['delete', 'admin/products/{id}', 'admin.delete'], ['get', 'admin/orders', 'admin.orders'], ['patch', 'admin/orders/{id}', 'admin.advance']] as [$method,$path,$action]) {
            Route::$method($path, [OperationController::class, 'submit'])->name($action);
        }
    });
});
