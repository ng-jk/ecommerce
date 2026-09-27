<?php

namespace App\Domain\Payments;

use App\Models\Payment;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use UnexpectedValueException;

class Stripe
{
    public function ensureConfigured(): void
    {
        $url = config('payments.stripe.return_url');
        if (! is_string(config('payments.stripe.secret')) || config('payments.stripe.secret') === ''
            || ! is_string(config('payments.stripe.webhook_secret')) || config('payments.stripe.webhook_secret') === ''
            || ! is_string($url) || ! filter_var($url, FILTER_VALIDATE_URL) || parse_url($url, PHP_URL_SCHEME) !== 'https') {
            throw ValidationException::withMessages(['payment' => 'Stripe merchant configuration is incomplete.']);
        }
    }

    public function create(Payment $payment): array
    {
        $this->ensureConfigured();
        $order = $payment->order;
        $response = $this->request()->withHeaders(['Idempotency-Key' => 'checkout-'.$payment->public_id])->post('https://api.stripe.com/v1/checkout/sessions', [
            'mode' => 'payment', 'client_reference_id' => $payment->public_id,
            'metadata' => ['payment_id' => $payment->public_id],
            'success_url' => config('payments.stripe.return_url'),
            'cancel_url' => config('payments.stripe.return_url'),
            'line_items' => [['quantity' => 1, 'price_data' => [
                'currency' => strtolower($order->currency), 'unit_amount' => $order->total,
                'product_data' => ['name' => 'Order '.$order->order_number],
            ]]],
        ]);

        return $this->decode($payment, $response);
    }

    public function fetch(Payment $payment, string $id): array
    {
        if (! preg_match('/^cs_(test_|live_)?[a-zA-Z0-9]{1,200}$/D', $id)) {
            throw new UnexpectedValueException('Invalid Stripe session.');
        }

        return $this->decode($payment, $this->request()->get('https://api.stripe.com/v1/checkout/sessions/'.$id));
    }

    private function decode(Payment $payment, Response $response): array
    {
        $response->throw();
        if (! $response->successful()) {
            throw new UnexpectedValueException('Unexpected Stripe response.');
        }

        return $this->normalize($payment, $response->json());
    }

    private function request(): PendingRequest
    {
        return Http::asForm()->acceptJson()->withToken(config('payments.stripe.secret'))
            ->connectTimeout(5)->timeout(15)->withoutRedirecting();
    }

    private function normalize(Payment $payment, mixed $session): array
    {
        $order = $payment->order;
        if (! is_array($session) || ($session['object'] ?? null) !== 'checkout.session'
            || ($session['mode'] ?? null) !== 'payment'
            || ($session['client_reference_id'] ?? null) !== $payment->public_id
            || ($session['metadata']['payment_id'] ?? null) !== $payment->public_id
            || ($session['amount_total'] ?? null) !== $order->total
            || ($session['currency'] ?? null) !== strtolower($order->currency)
            || ($session['livemode'] ?? null) !== ! $payment->sandbox
            || ! in_array($session['status'] ?? null, ['open', 'complete', 'expired'], true)
            || ! in_array($session['payment_status'] ?? null, ['paid', 'unpaid'], true)
            || ($session['payment_status'] === 'paid' && $session['status'] !== 'complete')) {
            throw new UnexpectedValueException('Stripe session does not match the invoice.');
        }
        $url = $session['url'] ?? null;
        if ($url !== null && (! is_string($url) || ! preg_match('~^https://checkout\.stripe\.com/c/pay/[a-zA-Z0-9_]+(?:#[^\s]*)?$~D', $url))) {
            throw new UnexpectedValueException('Invalid Stripe checkout URL.');
        }
        $paid = $session['payment_status'] === 'paid';

        return ['id' => $session['id'] ?? null, 'collection_id' => 'stripe',
            'reference_2' => $payment->public_id, 'amount' => $order->total,
            'paid' => $paid, 'paid_amount' => $paid ? $order->total : 0,
            'state' => $paid ? 'paid' : ($session['status'] === 'expired' ? 'deleted' : 'due'), 'checkout_url' => $url];
    }
}
