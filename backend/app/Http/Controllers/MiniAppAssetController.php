<?php

namespace App\Http\Controllers;

use App\Models\MiniAppVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class MiniAppAssetController extends Controller
{
    public function __invoke(Request $request, string $digest, string $path): Response
    {
        $origin = config('miniapps.asset_origin');
        abort_unless($origin && $request->getSchemeAndHttpHost() === $origin, 404);
        abort_if($request->headers->has('Cookie') || $request->headers->has('Authorization'), 404);
        $appOrigin = rtrim((string) config('app.url'), '/');
        abort_if($origin === $appOrigin, 404);
        $assetHost = parse_url($origin, PHP_URL_HOST);
        $firstParty = array_map(fn (string $entry): string => strtolower(explode(':', $entry)[0]), (array) config('sanctum.stateful', []));
        abort_if(in_array(strtolower((string) $assetHost), $firstParty, true), 404);
        abort_unless(preg_match('/\A[a-f0-9]{64}\z/D', $digest) && preg_match('/\A[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.(?:html|js|css|png|jpg|jpeg|webp|svg|json)\z/D', $path) && ! str_contains($path, '..'), 404);
        $version = MiniAppVersion::where('digest', $digest)->whereNotNull('approved_at')->firstOrFail();
        $file = 'miniapps/assets/'.$digest.'/'.$path;
        abort_unless(Storage::disk('local')->exists($file), 404);
        $bytes = Storage::disk('local')->get($file);
        abort_unless(isset($version->asset_hashes[$path]) && hash_equals($version->asset_hashes[$path], hash('sha256', $bytes)), 404);
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $types = ['html' => 'text/html', 'js' => 'text/javascript', 'css' => 'text/css', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'svg' => 'image/svg+xml', 'json' => 'application/json'];
        $parents = config('miniapps.parent_origins');
        $frameAncestors = $parents ? implode(' ', array_filter($parents, fn (string $value): bool => preg_match('~\Ahttps?://[a-z0-9.-]+(?::[0-9]{1,5})?\z~iD', $value) === 1)) : "'none'";
        $releaseOrigin = $origin.'/miniapp-assets/'.$digest.'/';
        $csp = "default-src 'none'; script-src $releaseOrigin; style-src $releaseOrigin; img-src $releaseOrigin data:; font-src $releaseOrigin; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; navigate-to 'none'; sandbox allow-scripts; frame-ancestors $frameAncestors";

        return response($bytes, 200, ['Content-Type' => $types[$extension], 'Content-Security-Policy' => $csp, 'X-Content-Type-Options' => 'nosniff', 'Referrer-Policy' => 'no-referrer', 'Cache-Control' => $extension === 'html' ? 'no-store' : 'public, max-age=31536000, immutable', 'Cross-Origin-Resource-Policy' => 'cross-origin', 'Access-Control-Allow-Origin' => '*']);
    }
}
