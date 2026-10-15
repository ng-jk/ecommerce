<?php

namespace App\Modules\Platform\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

final class ServiceTransport
{
    public function __construct(private string $url, private string $token, private string $source = 'platform', private string $destination = 'crm')
    {
        $parts = parse_url($url);
        if (! $parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || ! preg_match('/^[A-Za-z0-9_-]{32,256}$/D', $token)) {
            throw new \InvalidArgumentException('Invalid service endpoint configuration.');
        }
    }

    /** @param array<string, mixed> $envelope */
    public function deliver(array $envelope, string $digest): void
    {
        $receipt = $this->post('/inbox', $envelope, 202);
        if ($receipt !== ['id' => $envelope['id'], 'digest' => $digest, 'status' => 'accepted']) {
            throw new \RuntimeException('Invalid durable service receipt.');
        }
    }

    /** A fresh remote decision is a snapshot, not an atomic cross-database authorization lock.
     * @param  array<string, mixed>  $scope
     */
    public function authorize(array $scope): bool
    {
        $nonce = (string) Str::uuid();
        $response = $this->post('/authorize', ['scope' => $scope, 'nonce' => $nonce], 200);

        return ($response['nonce'] ?? null) === $nonce && ($response['allowed'] ?? null) === true;
    }

    public function authorizeResult(array $binding): bool
    {
        $nonce = (string) Str::uuid();
        $response = $this->post('/result-authority', [...$binding, 'nonce' => $nonce], 200);

        return ($response['nonce'] ?? null) === $nonce && ($response['allowed'] ?? null) === true;
    }

    /** @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function post(string $path, array $body, int $status): array
    {
        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Service network calls require no local transaction.');
        }
        $url = rtrim($this->url, '/').$path;
        $encoded = json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $timestamp = (string) now()->timestamp;
        $nonce = (string) Str::uuid();
        $response = Http::withHeaders(['X-Service-Source' => $this->source, 'X-Service-Destination' => $this->destination,
            'X-Service-Timestamp' => $timestamp, 'X-Service-Nonce' => $nonce,
            'X-Service-Signature' => ServiceAuthentication::signature($this->token, 'POST', parse_url($url, PHP_URL_PATH),
                $this->source, $this->destination, $timestamp, $nonce, $encoded)])
            ->acceptJson()->withBody($encoded, 'application/json')->connectTimeout(3)->timeout(10)->withoutRedirecting()->post($url);
        if ($response->status() >= 400 && $response->status() < 500 && ! in_array($response->status(), [408, 429], true)) {
            throw new \DomainException('Service rejected the request.');
        }
        if ($response->status() !== $status || strlen($response->body()) > 4096
            || ! str_starts_with(strtolower($response->header('Content-Type')), 'application/json')
            || ! is_array($response->json())
            || ! hash_equals(ServiceAuthentication::receipt($this->token, $nonce, $response->body()), $response->header('X-Service-Receipt'))) {
            throw new \RuntimeException('Service unavailable or incompatible response.');
        }

        return $response->json();
    }
}
