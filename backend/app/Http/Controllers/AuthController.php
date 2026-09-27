<?php

namespace App\Http\Controllers;

use App\Domain\AccessPolicy;
use App\Models\Shop;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function me(Request $request, Shop $shop): array
    {
        app(AccessPolicy::class)->enforce('auth.me', $request->user());

        return ['user' => $request->user()];
    }
}
