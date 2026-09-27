<?php

use App\Models\Payment;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\ServiceProvider;

class PaymentTestProvider extends ServiceProvider
{
    public function boot(): void
    {
        if (! app()->environment('testing') || config('database.connections.pgsql.database') !== 'commerce_test') {
            throw new LogicException('Payment fixture requires the isolated API test database.');
        }
        $customToken = 'TEST_CUSTOM_PAYMENT_TOKEN_2026_WITH_MORE_THAN_THIRTY_TWO_BYTES';
        config(['payments.driver' => 'simulated', 'payments.drivers.payment-test' => 'billplz',
            'payments.drivers.stripe-test' => 'stripe', 'payments.enabled.stripe-test' => ['stripe'],
            'payments.drivers.custom-test' => 'bank-transfer', 'payments.enabled.custom-test' => ['bank-transfer'],
            'payments.custom.bank-transfer' => ['enabled' => true, 'shop' => 'custom-test', 'token_hash' => hash('sha256', $customToken)],
            'payments.stripe' => ['secret' => 'sk_test_isolated', 'webhook_secret' => 'whsec_test',
                'return_url' => 'https://shop.example.test/orders', 'sandbox' => true],
            'payments.sandbox' => true,
            'payments.api_key' => 'isolated-api-test', 'payments.signature_key' => 'isolated-signature-test',
            'payments.collections.payment-test' => 'isolated-collection',
            'payments.webhook_base' => 'https://api.example.test',
            'payments.returns.payment-test' => 'https://shop.example.test/orders']);
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills*' => function ($request) {
            $reference = $request->method() === 'POST' ? $request['reference_2'] : substr(basename($request->url()), 5);
            $payment = Payment::where('public_id', $reference)->firstOrFail();
            $event = $payment->events()->latest('id')->first();
            $paid = ($event?->payload['paid'] ?? null) === 'true';

            return Http::response(['id' => 'test-'.$payment->public_id,
                'collection_id' => $payment->collection_id, 'reference_2' => $payment->public_id,
                'amount' => $payment->order->total, 'paid_amount' => $paid ? $payment->order->total : 0,
                'paid' => $paid, 'state' => $paid ? 'paid' : 'due']);
        }, 'https://api.stripe.com/v1/checkout/sessions*' => function ($request) {
            if ($request->method() === 'POST') {
                $payment = Payment::where('public_id', $request['client_reference_id'])->firstOrFail();
            } else {
                $sessionId = basename(parse_url($request->url(), PHP_URL_PATH));
                $payment = Payment::all()->first(fn (Payment $candidate) => 'cs_test_'.str_replace('-', '', $candidate->public_id) === $sessionId);
                if (! $payment) {
                    return Http::response(['error' => ['message' => 'Unknown test Checkout session']], 404);
                }
            }
            $paid = $request->method() === 'GET' && $payment->events()->exists();
            $sessionId = 'cs_test_'.str_replace('-', '', $payment->public_id);

            return Http::response(['id' => $sessionId, 'object' => 'checkout.session', 'mode' => 'payment',
                'client_reference_id' => $payment->public_id, 'metadata' => ['payment_id' => $payment->public_id],
                'amount_total' => $payment->order->total, 'currency' => strtolower($payment->order->currency),
                'livemode' => false, 'status' => $paid ? 'complete' : 'open',
                'payment_status' => $paid ? 'paid' : 'unpaid',
                'url' => 'https://checkout.stripe.com/c/pay/'.$sessionId]);
        }]);
        Artisan::command('payments:test-seed', function () {
            foreach (['payment-test', 'stripe-test', 'custom-test'] as $slug) {
                $shop = Shop::firstOrCreate(['slug' => $slug], ['name' => 'Isolated '.$slug]);
                User::firstOrCreate(['shop_id' => $shop->id, 'email' => 'admin@'.$slug.'.demo'], [
                    'name' => $slug.' admin', 'role' => 'admin', 'password' => 'Portfolio2026!',
                ]);
            }
        });
    }
}
