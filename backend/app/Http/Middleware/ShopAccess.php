<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ShopAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user() && $request->user()->shop_id === $request->route('shop')->id, 403, 'This account belongs to another shop.');

        return $next($request);
    }
}
