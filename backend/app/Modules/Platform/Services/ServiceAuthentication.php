<?php

namespace App\Modules\Platform\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ServiceAuthentication
{
    /** @return array{source: string, destination: string, nonce: string, key: string, peer: array} */
    public function authenticate(Request $request): array
    {
        abort_unless(config('service_exchange.enabled') === true, 404);
        abort_unless($request->isSecure(), 400);
        abort_if(strlen($request->getContent()) > 65536, 413);
        abort_unless($request->isJson(), 415);
        $source = (string) $request->header('X-Service-Source');
        $destination = (string) $request->header('X-Service-Destination');
        $nonce = (string) $request->header('X-Service-Nonce');
        $timestamp = (string) $request->header('X-Service-Timestamp');
        $peer = config('service_exchange.peers.'.$source);
        $key = is_array($peer) ? ($peer['key'] ?? '') : '';
        abort_unless(is_string($key) && strlen($key) >= 32 && $destination === config('service_exchange.name')
            && Str::isUuid($nonce) && ctype_digit($timestamp) && abs(now()->timestamp - (int) $timestamp) <= 60, 401);
        $expected = self::signature($key, $request->method(), $request->getPathInfo(), $source, $destination,
            $timestamp, $nonce, $request->getContent());
        abort_unless(hash_equals($expected, (string) $request->header('X-Service-Signature')), 401);
        $inserted = DB::table('service_request_nonces')->insertOrIgnore(['source' => $source, 'nonce' => $nonce,
            'created_at' => now(), 'updated_at' => now()]);
        abort_unless($inserted === 1, 409);

        return compact('source', 'destination', 'nonce', 'key', 'peer');
    }

    public static function signature(string $key, string $method, string $path, string $source,
        string $destination, string $timestamp, string $nonce, string $body): string
    {
        return hash_hmac('sha256', implode("\n", [$method, $path, $source, $destination, $timestamp, $nonce, hash('sha256', $body)]), $key);
    }

    public static function receipt(string $key, string $nonce, string $body): string
    {
        return hash_hmac('sha256', $nonce."\n".hash('sha256', $body), $key);
    }
}
