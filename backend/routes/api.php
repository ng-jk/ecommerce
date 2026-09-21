<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\StoreController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/shops/{shop:slug}')->group(function () {
    Route::get('products', [StoreController::class, 'products']);
    Route::get('products/{id}', [StoreController::class, 'product']);
    Route::post('auth/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::middleware(['auth:sanctum', 'shop.access'])->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('cart', [StoreController::class, 'cart']);
        Route::put('cart', [StoreController::class, 'updateCart']);
        Route::post('checkout', [StoreController::class, 'checkout'])->middleware('throttle:30,1');
        Route::get('orders', [StoreController::class, 'orders']);
        Route::get('admin/products', [AdminController::class, 'products']);
        Route::post('admin/products', [AdminController::class, 'createProduct']);
        Route::patch('admin/products/{id}', [AdminController::class, 'updateProduct']);
        Route::get('admin/orders', [AdminController::class, 'orders']);
        Route::patch('admin/orders/{id}', [AdminController::class, 'updateOrder']);
    });
});
