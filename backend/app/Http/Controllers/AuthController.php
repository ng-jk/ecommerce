<?php

namespace App\Http\Controllers;

use App\Models\Shop;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function me(Request $request, Shop $shop): array
    {
        return ['user' => $request->user()];
    }
}
