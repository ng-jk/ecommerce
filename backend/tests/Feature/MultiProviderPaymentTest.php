<?php

namespace Tests\Feature;

use App\Domain\Payments\PaymentProcessor;
use App\Domain\Payments\PaymentProviders;
use App\Domain\Payments\Stripe;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use UnexpectedValueException;

class MultiProviderPaymentTest extends TestCase
{
    use RefreshDatabase;

    private const Token = 'custom-integration-private-token-123456789';

    protected function setUp(): void
    {
        parent::setUp();
        config(['payments.driver' => 'stripe', 'payments.stripe.secret' => 'sk_test_private',
            'payments.stripe.webhook_secret' => 'whsec_test', 'payments.stripe.return_url' => 'https://shop.example.test/orders',
            'payments.stripe.sandbox' => true, 'payments.enabled.fashion' => ['stripe', 'bank', 'simulated'],
            'payments.custom.bank' => ['enabled' => true, 'shop' => 'fashion', 'token_hash' => hash('sha256', self::Token)]]);
        Http::preventStrayRequests();
    }

    private function checkout(string $method = 'stripe'): Payment
    {
        $shop = Shop::firstOrCreate(['slug' => 'fashion'], ['name' => 'Fashion']);
        $product = Product::create(['shop_id' => $shop->id, 'name' => 'Shirt', 'category' => 'Clothes',
            'description' => 'Shirt', 'image_url' => 'https://example.test/shirt.png', 'price' => 1000, 'stock' => 2]);
        $user = User::factory()->create(['shop_id' => $shop->id, 'role' => 'admin', 'cart' => [['product_id' => $product->id, 'quantity' => 1]]]);
        Sanctum::actingAs($user);
        $data = ['checkout_key' => (string) Str::uuid(), 'payment_method' => $method,
            'shipping_address' => ['name' => 'Payer', 'line1' => 'Street', 'city' => 'KL', 'postcode' => '50000', 'country' => 'MY']];
        $response = $this->postJson('/api/v1/shops/fashion/checkout', $data)->assertOk();
        $this->postJson('/api/v1/shops/fashion/checkout', $data)->assertOk();
        $this->postJson('/api/v1/shops/fashion/checkout', array_replace($data, ['payment_method' => 'simulated']))->assertConflict();

        return Payment::where('public_id', $response->json('order.payment.invoice_id'))->firstOrFail();
    }

    private function stripeSession(Payment $payment, array $changes = []): array
    {
        return array_replace(['id' => 'cs_test_abc123', 'object' => 'checkout.session', 'mode' => 'payment',
            'client_reference_id' => $payment->public_id, 'metadata' => ['payment_id' => $payment->public_id],
            'amount_total' => 1800, 'currency' => 'myr', 'livemode' => false, 'status' => 'open', 'payment_status' => 'unpaid',
            'url' => 'https://checkout.stripe.com/c/pay/cs_test_abc123#test'], $changes);
    }

    private function webhook(Payment $payment, string $id = 'evt_test1', string $type = 'checkout.session.completed', int $offset = 0): TestResponse
    {
        $body = json_encode(['id' => $id, 'object' => 'event', 'type' => $type,
            'data' => ['object' => ['id' => 'cs_test_abc123', 'client_reference_id' => $payment->public_id]]]);
        $timestamp = time() + $offset;
        $signature = hash_hmac('sha256', $timestamp.'.'.$body, 'whsec_test');

        return $this->call('POST', '/api/v1/payments/stripe', [], [], [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => "t=$timestamp,v1=$signature"], $body);
    }

    private function confirm(Payment $payment, ?string $key = null, string $token = self::Token): TestResponse
    {
        return $this->call('POST', '/api/v1/payment-integrations/bank/confirm', [], [], [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$token,
                'HTTP_IDEMPOTENCY_KEY' => $key ?? (string) Str::uuid()], json_encode(['invoice_id' => $payment->public_id]));
    }

    public function test_stripe_checkout_and_signed_event_require_verified_provider_payment(): void
    {
        $payment = $this->checkout();
        $worker = app(PaymentProcessor::class);
        Http::fake(['https://api.stripe.com/v1/checkout/sessions' => Http::response($this->stripeSession($payment)),
            'https://api.stripe.com/v1/checkout/sessions/cs_test_abc123' => Http::sequence()
                ->push($this->stripeSession($payment, ['status' => 'complete']))
                ->push($this->stripeSession($payment, ['status' => 'complete', 'payment_status' => 'paid', 'url' => null]))]);
        $worker->processNext();
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $this->webhook($payment)->assertOk();
        $this->webhook($payment)->assertOk();
        $this->assertDatabaseCount('payment_events', 1);
        $worker->processNext();
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $this->patchJson('/api/v1/shops/fashion/admin/orders/'.$payment->order_id, ['status' => 'processing'])->assertUnprocessable();
        $this->webhook($payment, 'evt_test2', 'checkout.session.async_payment_succeeded')->assertOk();
        $worker->processNext();
        $this->assertSame(Payment::Paid, $payment->fresh()->status);
        $this->assertNull($payment->fresh()->checkout_url);
        $this->patchJson('/api/v1/shops/fashion/admin/orders/'.$payment->order_id, ['status' => 'processing'])->assertOk();
        $this->assertSame(1, Product::first()->stock);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && $request->hasHeader('Idempotency-Key', 'checkout-'.$payment->public_id)
            && $request['line_items'][0]['price_data']['unit_amount'] === 1800
            && $request['metadata']['payment_id'] === $payment->public_id);
        Http::assertSentCount(3);
    }

    public function test_expired_stripe_session_releases_stock_only_once(): void
    {
        $payment = $this->checkout();
        Http::fake(['https://api.stripe.com/v1/checkout/sessions/cs_test_abc123' => Http::response($this->stripeSession($payment, ['status' => 'expired', 'url' => null]))]);
        $this->webhook($payment, 'evt_expired', 'checkout.session.expired')->assertOk();
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(Payment::Cancelled, $payment->fresh()->status);
        $this->assertSame(2, Product::first()->stock);
        $this->webhook($payment, 'evt_expired_again', 'checkout.session.expired')->assertOk();
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(2, Product::first()->stock);
        Http::assertSentCount(2);
    }

    public function test_stripe_webhook_rejects_forgery_stale_signature_and_oversize(): void
    {
        $payment = $this->checkout();
        $this->post('/api/v1/payments/stripe', [], ['Accept' => 'application/json'])->assertUnauthorized();
        $this->webhook($payment, offset: -600)->assertUnauthorized();
        $this->call('POST', '/api/v1/payments/stripe', [], [], [], [], str_repeat('x', 65537))->assertStatus(413);
        $this->webhook($payment, type: 'customer.created')->assertOk();
        $this->assertDatabaseCount('payment_events', 0);
        config(['payments.stripe.webhook_secret' => '']);
        $this->webhook($payment)->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_provider_fields_cannot_settle_a_different_invoice_or_invalid_state(): void
    {
        $payment = $this->checkout();
        $changes = [['object' => 'payment_intent'], ['mode' => 'subscription'], ['client_reference_id' => 'another'],
            ['metadata' => ['payment_id' => 'another']], ['amount_total' => 1], ['currency' => 'usd'], ['livemode' => true],
            ['status' => 'unknown'], ['payment_status' => 'unknown'], ['payment_status' => 'paid'],
            ['url' => 'https://evil.example.test'], ['url' => 123]];
        $sequence = Http::sequence();
        foreach ($changes as $change) {
            $sequence->push($this->stripeSession($payment, $change));
        }
        $sequence->push('not-json');
        Http::fake(['https://api.stripe.com/v1/checkout/sessions/cs_test_abc123' => $sequence]);
        foreach (range(0, count($changes)) as $i) {
            try {
                app(Stripe::class)->fetch($payment, 'cs_test_abc123');
                $this->fail('Invalid provider response accepted '.$i);
            } catch (UnexpectedValueException) {
                $this->assertSame(Payment::Queued, $payment->fresh()->status);
            }
        }
        Http::assertSentCount(count($changes) + 1);
        $this->expectException(UnexpectedValueException::class);
        app(Stripe::class)->fetch($payment, '../not-a-session');
    }

    public function test_redirects_and_provider_failures_leave_creation_for_review(): void
    {
        $payment = $this->checkout();
        Http::fake(['https://api.stripe.com/v1/checkout/sessions' => Http::response($this->stripeSession($payment), 302)]);
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(Payment::Review, $payment->fresh()->status);
        $this->assertSame(1, Product::first()->stock);
        $this->assertFalse(app(PaymentProcessor::class)->processNext());
        Http::assertSentCount(1);
    }

    public function test_missing_merchant_configuration_and_disabled_methods_reject_before_provider_io(): void
    {
        foreach (['secret' => '', 'webhook_secret' => '', 'return_url' => 'http://insecure.test'] as $field => $bad) {
            $old = config('payments.stripe.'.$field);
            config(['payments.stripe.'.$field => $bad]);
            try {
                app(PaymentProviders::class)->select('fashion', 'stripe');
                $this->fail('Invalid Stripe config accepted');
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('payment', $e->errors());
            }
            config(['payments.stripe.'.$field => $old]);
        }
        try {
            app(PaymentProviders::class)->select('fashion', 'unknown');
            $this->fail('Disabled method accepted');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('payment_method', $e->errors());
        }
        foreach ([null, ['enabled' => false], ['enabled' => true, 'shop' => 'other'],
            ['enabled' => true, 'shop' => 'fashion', 'token_hash' => 'bad']] as $invalid) {
            config(['payments.custom.bank' => $invalid]);
            try {
                app(PaymentProviders::class)->select('fashion', 'bank');
                $this->fail('Invalid integration accepted');
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('payment', $e->errors());
            }
        }
        Http::assertNothingSent();
    }

    public function test_cart_exposes_only_configured_payment_options_and_labels(): void
    {
        $this->checkout('bank');
        config(['payments.custom.bank.label' => 'Merchant bank transfer', 'payments.stripe.secret' => '']);
        $this->getJson('/api/v1/shops/fashion/cart')->assertOk()
            ->assertJsonPath('payment_methods.bank', 'Merchant bank transfer')
            ->assertJsonMissingPath('payment_methods.stripe')
            ->assertJsonPath('default_payment_method', null);
        config(['payments.enabled.fashion' => ['stripe']]);
        $this->getJson('/api/v1/shops/fashion/cart')->assertOk()
            ->assertJsonPath('payment_methods', [])
            ->assertJsonPath('default_payment_method', null);
        Http::assertNothingSent();
    }

    public function test_custom_confirmation_is_durable_scoped_idempotent_and_worker_settled(): void
    {
        $payment = $this->checkout('bank');
        $worker = app(PaymentProcessor::class);
        $worker->processNext();
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $key = (string) Str::uuid();
        $first = $this->confirm($payment, $key)->assertAccepted()->assertJsonPath('status', 'queued');
        $id = $first->json('event_id');
        $this->confirm($payment, $key)->assertAccepted()->assertJsonPath('event_id', $id);
        $this->assertDatabaseCount('payment_events', 1);
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $this->getJson('/api/v1/payment-integrations/bank/'.$id, ['Authorization' => 'Bearer '.self::Token])->assertOk()->assertJsonPath('status', 'queued');
        $worker->processNext();
        $this->assertSame(Payment::Paid, $payment->fresh()->status);
        $this->getJson('/api/v1/payment-integrations/bank/'.$id, ['Authorization' => 'Bearer '.self::Token])->assertOk()->assertJsonPath('status', 'processed');
        $this->confirm($payment, $key)->assertAccepted()->assertJsonPath('status', 'processed');
        $this->assertSame(1, Product::first()->stock);
        Http::assertNothingSent();
    }

    public function test_custom_authentication_invoice_binding_and_conflicting_replay_reject(): void
    {
        $payment = $this->checkout('bank');
        $key = (string) Str::uuid();
        $this->confirm($payment, token: 'short')->assertUnauthorized();
        $this->confirm($payment, token: str_repeat('x', 40))->assertUnauthorized();
        $this->confirm($payment, key: 'bad')->assertUnprocessable()->assertJsonStructure(['validation_error']);
        $this->confirm($payment, $key)->assertAccepted();
        $other = $this->checkout('bank');
        $this->confirm($other, $key)->assertConflict();
        $stripe = $this->checkout();
        $this->confirm($stripe)->assertNotFound();
        $payment->update(['status' => Payment::Cancelled]);
        $this->confirm($payment)->assertConflict();
        config(['payments.custom.bank.shop' => 'electronics']);
        Shop::create(['slug' => 'electronics', 'name' => 'Electronics']);
        $this->confirm($other)->assertNotFound();
        $this->getJson('/api/v1/payment-integrations/bank/'.PaymentEvent::first()->id, ['Authorization' => 'Bearer '.self::Token])->assertNotFound();
        config(['payments.custom.bank.enabled' => false]);
        $this->confirm($other)->assertUnauthorized();
        $this->assertDatabaseCount('payment_events', 1);
        Http::assertNothingSent();
    }

    public function test_revoked_custom_credential_cannot_execute_previously_accepted_event(): void
    {
        $payment = $this->checkout('bank');
        app(PaymentProcessor::class)->processNext();
        $id = $this->confirm($payment)->assertAccepted()->json('event_id');
        config(['payments.custom.bank.token_hash' => hash('sha256', 'new-secret')]);
        foreach (range(1, 5) as $attempt) {
            app(PaymentProcessor::class)->processNext();
            $this->travel(6)->minutes();
        }
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $this->assertNull(PaymentEvent::find($id)->processed_at);
        $this->assertSame(5, PaymentEvent::find($id)->attempts);
        config(['payments.custom.bank.token_hash' => hash('sha256', self::Token)]);
        $this->getJson('/api/v1/payment-integrations/bank/'.$id, ['Authorization' => 'Bearer '.self::Token])->assertOk()->assertJsonPath('status', 'rejected');
        Http::assertNothingSent();
    }

    public function test_disabled_custom_method_cannot_create_pending_payment_and_size_is_bounded(): void
    {
        $payment = $this->checkout('bank');
        config(['payments.custom.bank.enabled' => false]);
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(Payment::Review, $payment->fresh()->status);
        $this->call('POST', '/api/v1/payment-integrations/bank/confirm', [], [], [], [], str_repeat('x', 4097))->assertStatus(413);
        $this->assertSame(1, Product::first()->stock);
        Http::assertNothingSent();
    }
}
