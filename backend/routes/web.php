<?php

use App\Http\Controllers\MiniAppAssetController;
use Illuminate\Support\Facades\Route;

Route::get('miniapp-assets/{digest}/{path}', MiniAppAssetController::class)->where('path', '.*')->withoutMiddleware('web');

Route::get('/', function () {
    return view('welcome');
});
