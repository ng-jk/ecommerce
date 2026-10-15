<?php

use App\Http\Controllers\ServiceInboxController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/internal/services')->middleware('throttle:60,1')->group(function (): void {
    Route::post('inbox', [ServiceInboxController::class, 'inbox'])->name('internal.services.inbox');
    Route::post('authorize', [ServiceInboxController::class, 'authorize'])->name('internal.services.authorize');
    Route::post('result-authority', [ServiceInboxController::class, 'resultAuthority'])->name('internal.services.result-authority');
});
