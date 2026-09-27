<?php

namespace App\Domain\Payments;

use App\Models\Payment;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class Billplz
{
    public function host(bool $sandbox): string
    {
        return $sandbox ? 'www.billplz-sandbox.com' : 'www.billplz.com';
    }

    public function ensureConfigured(string $shop): void
    {
        foreach (['api_key', 'signature_key', 'collections.'.$shop] as $key) {
            if (! is_string(config('payments.'.$key)) || config('payments.'.$key) === '') {
                throw ValidationException::withMessages(['payment' => 'Merchant payment configuration is incomplete.']);
            }
        }
        foreach (['webhook_base', 'returns.'.$shop] as $key) {
            $url = config('payments.'.$key);
            if (! is_string($url) || ! filter_var($url, FILTER_VALIDATE_URL) || parse_url($url, PHP_URL_SCHEME) !== 'https') {
                throw ValidationException::withMessages(['payment' => 'Merchant payment URLs must use HTTPS.']);
            }
        }
    }

    public function signature(array $data): string
    {
        unset($data['x_signature']);
        $parts = [];
        foreach ($data as $key => $value) {
            if (! is_scalar($value) && $value !== null) {
                throw ValidationException::withMessages(['callback' => 'Invalid callback field.']);
            }
            $parts[] = $key.(is_bool($value) ? ($value ? 'true' : 'false') : (string) $value);
        }
        usort($parts, 'strcasecmp');

        return hash_hmac('sha256', implode('|', $parts), config('payments.signature_key'));
    }

    public function create(Payment $payment): array
    {
        $order = $payment->order;
        $slug = Shop::findOrFail($order->shop_id)->slug;
        $user = User::findOrFail($order->user_id);
        $this->ensureConfigured($slug);

        return $this->decode($this->request()->post('https://'.$this->host($payment->sandbox).'/api/v3/bills', [
            'collection_id' => $payment->collection_id, 'name' => $user->name, 'email' => $user->email,
            'amount' => $order->total, 'description' => 'Order '.$order->order_number,
            'callback_url' => rtrim(config('payments.webhook_base'), '/').'/api/v1/payments/billplz/'.$payment->public_id,
            'redirect_url' => config('payments.returns.'.$slug),
            'reference_1_label' => 'Bank Code', 'reference_1' => 'BP-RHBQR',
            'reference_2_label' => 'Payment reference', 'reference_2' => $payment->public_id,
        ]));
    }

    public function fetch(Payment $payment, string $bill): array
    {
        abort_unless(preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $bill), 422, 'Invalid bill ID.');

        return $this->decode($this->request()->get('https://'.$this->host($payment->sandbox).'/api/v3/bills/'.$bill));
    }

    private function decode(Response $response): array
    {
        $response->throw();
        $body = $response->json();
        if (! $response->successful() || ! is_array($body)) {
            throw new \UnexpectedValueException('Unexpected provider response.');
        }

        return $body;
    }

    private function request(): PendingRequest
    {
        // POST is deliberately not retried: bill creation has no documented idempotency key.
        return Http::asForm()->acceptJson()->withBasicAuth(config('payments.api_key'), '')
            ->connectTimeout(5)->timeout(15)->withoutRedirecting();
    }
}
