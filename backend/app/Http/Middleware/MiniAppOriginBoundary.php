<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class MiniAppOriginBoundary
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = config('miniapps.asset_origin');
        if ($origin && $request->getSchemeAndHttpHost() === $origin) {
            abort_unless($request->is('miniapp-assets/*'), 404);
        } elseif ($request->is('miniapp-assets/*')) {
            abort(404);
        }

        return $next($request);
    }
}
