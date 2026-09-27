<?php

namespace Tests\Feature;

use App\Domain\Payments\Billplz;
use App\Domain\Payments\PaymentProcessor;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payments.driver' => 'billplz', 'payments.sandbox' => true,
            'payments.api_key' => 'test-api', 'payments.signature_key' => 'test-signature',
            'payments.collections.fashion' => 'collection1',
            'payments.webhook_base' => 'https://api.example.test',
            'payments.returns.fashion' => 'https://fashion.example.test/orders']);
        Http::preventStrayRequests();
    }

    private function checkout(): Payment
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $product = Product::create(['shop_id' => $shop->id, 'name' => 'Shirt', 'category' => 'Clothes',
            'description' => 'Shirt', 'image_url' => 'https://example.test/shirt.png', 'price' => 1000, 'stock' => 2]);
        $user = User::create(['shop_id' => $shop->id, 'name' => 'Payer', 'email' => 'payer@example.test',
            'password' => 'Password123!', 'role' => 'admin', 'cart' => [['product_id' => $product->id, 'quantity' => 1]]]);
        Sanctum::actingAs($user);
        $data = ['checkout_key' => (string) Str::uuid(), 'shipping_address' => ['name' => 'Payer',
            'line1' => 'Street', 'city' => 'KL', 'postcode' => '50000', 'country' => 'MY']];
        $this->postJson('/api/v1/shops/fashion/checkout', $data)->assertOk()
            ->assertJsonPath('order.total', 1800)->assertJsonPath('order.payment.status', 'queued');
        $this->postJson('/api/v1/shops/fashion/checkout', $data)->assertOk();
        $this->assertDatabaseCount('payments', 1);
        $this->assertSame(1, $product->fresh()->stock);

        return Payment::firstOrFail();
    }

    private function bill(Payment $payment, array $overrides = []): array
    {
        return array_replace(['id' => 'bill1', 'collection_id' => 'collection1', 'reference_2' => $payment->public_id,
            'amount' => 1800, 'paid_amount' => 0, 'paid' => false, 'state' => 'due',
            'url' => 'https://evil.example.test/'], $overrides);
    }

    private function sendCallback(Payment $payment, array $data): TestResponse
    {
        $data['x_signature'] = app(Billplz::class)->signature($data);

        // Use the real form transport; the general test helper injects expected_version for user commands.
        return $this->post('/api/v1/payments/billplz/'.$payment->public_id, $data, ['Accept' => 'application/json']);
    }

    public function test_checkout_worker_and_signed_callback_complete_payment_without_duplicate_stock_changes(): void
    {
        $payment = $this->checkout();
        $worker = app(PaymentProcessor::class);
        $this->patchJson('/api/v1/shops/fashion/admin/orders/'.$payment->order_id, ['status' => 'processing'])
            ->assertUnprocessable()->assertJsonPath('validation_error.payment.0', 'Payment must be verified before fulfillment.');
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills' => Http::response($this->bill($payment)),
            'https://www.billplz-sandbox.com/api/v3/bills/bill1' => Http::response($this->bill($payment, ['paid' => true, 'state' => 'paid', 'paid_amount' => 1800]))]);
        $this->assertTrue($worker->processNext());
        $this->assertFalse($worker->processNext());
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $this->getJson('/api/v1/shops/fashion/orders')->assertOk()
            ->assertJsonPath('orders.data.0.payment.checkout_url', 'https://www.billplz-sandbox.com/bills/bill1')
            ->assertJsonMissingPath('orders.data.0.payment.collection_id');
        $this->sendCallback($payment, ['id' => 'bill1', 'paid' => 'true'])->assertOk();
        $this->sendCallback($payment, ['id' => 'bill1', 'paid' => 'true'])->assertOk();
        $this->assertDatabaseCount('payment_events', 1);
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $worker->processNext();
        $this->assertSame(Payment::Paid, $payment->fresh()->status);
        $this->assertNull($payment->fresh()->checkout_url);
        $this->assertSame(1, Product::first()->stock);
        $this->patchJson('/api/v1/shops/fashion/admin/orders/'.$payment->order_id, ['status' => 'processing'])->assertOk();
        Http::assertSent(fn ($request) => $request->method() === 'POST' && $request['amount'] === 1800
            && $request['reference_1'] === 'BP-RHBQR' && $request['reference_2'] === $payment->public_id
            && $request['callback_url'] === 'https://api.example.test/api/v1/payments/billplz/'.$payment->public_id);
        Http::assertSentCount(2);
    }

    public function test_invalid_webhooks_cannot_enqueue_or_change_orders(): void
    {
        $payment = $this->checkout();
        $url = '/api/v1/payments/billplz/'.$payment->public_id;
        $this->post($url, ['id' => 'bill1'], ['Accept' => 'application/json'])->assertUnauthorized();
        $this->post($url, ['id' => 'bill1', 'x_signature' => str_repeat('0', 64)], ['Accept' => 'application/json'])->assertUnauthorized();
        $this->post($url, ['x_signature' => str_repeat('0', 64), 'nested' => ['bad']], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->sendCallback($payment, ['id' => '../bad'])->assertUnprocessable()->assertJsonStructure(['validation_error']);
        $this->call('POST', $url, [], [], [], ['CONTENT_TYPE' => 'application/json'], str_repeat('x', 16385))->assertStatus(413);
        config(['payments.signature_key' => '']);
        $this->post($url)->assertStatus(503);
        $this->assertDatabaseCount('payment_events', 0);
        $this->assertSame(Payment::Queued, $payment->fresh()->status);
    }

    public function test_ambiguous_creation_is_not_retried_and_callback_can_recover_bill(): void
    {
        $payment = $this->checkout();
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills' => Http::failedConnection(),
            'https://www.billplz-sandbox.com/api/v3/bills/bill1' => Http::response($this->bill($payment))]);
        $worker = app(PaymentProcessor::class);
        $worker->processNext();
        $this->assertSame(Payment::Review, $payment->fresh()->status);
        $this->assertFalse($worker->processNext());
        $this->sendCallback($payment, ['id' => 'bill1'])->assertOk();
        $worker->processNext();
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        Http::assertSent(fn ($request) => $request->method() === 'GET');
    }

    public function test_expired_creation_lease_never_repeats_post(): void
    {
        $this->freezeTime();
        $payment = $this->checkout();
        $payment->update(['status' => Payment::Creating, 'lease' => (string) Str::uuid(), 'lease_until' => now()->addMinute()]);
        $worker = app(PaymentProcessor::class);
        $this->assertFalse($worker->processNext());
        $this->travel(61)->seconds();
        $this->assertTrue($worker->processNext());
        $this->assertSame(Payment::Review, $payment->fresh()->status);
        Http::assertNothingSent();
    }

    public function test_deleted_bill_releases_stock_once_and_stale_due_cannot_reopen_it(): void
    {
        $payment = $this->checkout();
        $payment->update(['status' => Payment::Pending, 'bill_id' => 'bill1', 'next_check_at' => now()]);
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills/bill1' => Http::sequence()
            ->push($this->bill($payment, ['state' => 'deleted']))->push($this->bill($payment))
            ->push($this->bill($payment, ['paid' => true, 'state' => 'paid', 'paid_amount' => 1800]))]);
        $worker = app(PaymentProcessor::class);
        $worker->processNext();
        $this->assertSame(Payment::Cancelled, $payment->fresh()->status);
        $this->assertSame(2, Product::first()->stock);
        $this->sendCallback($payment, ['id' => 'bill1', 'state' => 'due'])->assertOk();
        $worker->processNext();
        $this->sendCallback($payment, ['id' => 'bill1', 'state' => 'paid'])->assertOk();
        $worker->processNext();
        $this->assertSame(Payment::Cancelled, $payment->fresh()->status);
        $this->assertSame(2, Product::first()->stock);
        Http::assertSentCount(3);
    }

    public function test_wrong_amount_collection_reference_and_bill_never_mark_paid(): void
    {
        $payment = $this->checkout();
        $worker = app(PaymentProcessor::class);
        $payment->update(['bill_id' => 'bill1', 'status' => Payment::Pending]);
        $sequence = Http::sequence();
        $invalid = [['amount' => 1], ['paid_amount' => 1], ['collection_id' => 'another'],
            ['reference_2' => (string) Str::uuid()], ['id' => 'other'], ['paid' => 'true'], ['state' => 'due']];
        foreach ($invalid as $fields) {
            $sequence->push($this->bill($payment, [...['paid' => true, 'state' => 'paid', 'paid_amount' => 1800], ...$fields]));
        }
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills/bill1' => $sequence]);
        foreach ($invalid as $index => $fields) {
            $this->sendCallback($payment, ['id' => 'bill1', 'test_sequence' => $index])->assertOk();
            $worker->processNext();
            $this->assertNotSame(Payment::Paid, $payment->fresh()->status);
        }
        $this->assertSame(1, Product::first()->stock);
        Http::assertSentCount(count($invalid));
    }

    public function test_configuration_errors_fail_before_reserving_stock(): void
    {
        $payment = $this->checkout();
        $user = User::first();
        $user->update(['cart' => [['product_id' => Product::first()->id, 'quantity' => 1]]]);
        $data = ['checkout_key' => (string) Str::uuid(), 'shipping_address' => $payment->order->shipping_address];
        foreach (['api_key', 'signature_key', 'collections.fashion', 'webhook_base', 'returns.fashion'] as $key) {
            $old = config('payments.'.$key);
            config(['payments.'.$key => '']);
            $this->postJson('/api/v1/shops/fashion/checkout', $data)->assertUnprocessable()->assertJsonStructure(['validation_error' => ['payment']]);
            config(['payments.'.$key => $old]);
        }
        config(['payments.driver' => 'unknown']);
        $this->postJson('/api/v1/shops/fashion/checkout', $data)->assertUnprocessable();
        $this->assertSame(1, Product::first()->stock);
        $this->assertDatabaseCount('orders', 1);
    }

    public function test_paid_is_monotonic_even_if_later_provider_read_returns_due(): void
    {
        $payment = $this->checkout();
        $payment->update(['status' => Payment::Paid, 'bill_id' => 'bill1', 'paid_at' => now()]);
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills/bill1' => Http::response($this->bill($payment))]);
        $this->sendCallback($payment, ['id' => 'bill1', 'paid' => false])->assertOk();
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(Payment::Paid, $payment->fresh()->status);
        $this->assertNull($payment->fresh()->checkout_url);
        Http::assertSentCount(1);
    }

    public function test_retry_exhaustion_keeps_inventory_reserved_and_payment_visible_for_review(): void
    {
        $payment = $this->checkout();
        $payment->update(['status' => Payment::Pending, 'bill_id' => 'bill1', 'attempts' => 11, 'next_check_at' => now()]);
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills/bill1' => Http::response([], 503)]);
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(Payment::Review, $payment->fresh()->status);
        $this->assertFalse(app(PaymentProcessor::class)->processNext());
        $this->assertSame(1, Product::first()->stock);
        Http::assertSentCount(1);
    }

    public function test_official_signature_vector_and_sandbox_host_selection(): void
    {
        config(['payments.signature_key' => 'S-s7b4yWpp9h7rrkNM1i3Z_g']);
        $provider = app(Billplz::class);
        $this->assertSame('4aab095fe5a39b1d534500988f9a0cb085cd1b6d5bbb55dd4e02ea6fa102b47b', $provider->signature([
            'billplzid' => 'zq0tm2wc', 'billplzpaid' => true, 'billplzpaid_at' => '2018-09-27 15:15:09 +0800']));
        $this->assertSame('www.billplz.com', $provider->host(false));
        $this->assertSame('www.billplz-sandbox.com', $provider->host(true));
    }

    public function test_stale_worker_cannot_commit_success_or_failure_after_losing_lease(): void
    {
        $payment = $this->checkout();
        $sequence = 0;
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills' => function () use ($payment, &$sequence) {
            $payment->refresh()->update(['lease' => (string) Str::uuid(), 'status' => Payment::Review]);
            $sequence++;

            return $sequence === 1 ? Http::response($this->bill($payment)) : Http::response([], 503);
        }]);
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(Payment::Review, $payment->fresh()->status);
        $this->assertNull($payment->fresh()->bill_id);
        $payment->refresh()->update(['status' => Payment::Queued, 'lease_until' => null]);
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(0, $payment->fresh()->attempts);
        $this->assertSame(Payment::Review, $payment->fresh()->status);
        Http::assertSentCount(2);
    }

    public function test_json_callback_uses_body_signature_and_does_not_accept_query_substitution(): void
    {
        $payment = $this->checkout();
        $this->settleOperations = false;
        $data = ['id' => 'bill1', 'paid' => false, 'mobile' => null];
        $data['x_signature'] = app(Billplz::class)->signature($data);
        $this->postJson('/api/v1/payments/billplz/'.$payment->public_id, $data)->assertOk();
        $this->assertDatabaseCount('payment_events', 1);
        $this->postJson('/api/v1/payments/billplz/'.Str::uuid(), $data)->assertNotFound();
        $this->assertSame(Payment::Queued, $payment->fresh()->status);
        $this->assertStringNotContainsString('bill1', DB::table('payment_events')->value('payload'));
    }

    public function test_provider_redirect_and_non_json_responses_cannot_settle_or_redirect_customer(): void
    {
        $payment = $this->checkout();
        $payment->update(['status' => Payment::Pending, 'bill_id' => 'bill1', 'next_check_at' => now()]);
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills/bill1' => Http::sequence()
            ->push($this->bill($payment, ['paid' => true, 'state' => 'paid', 'paid_amount' => 1800]), 302, ['Location' => 'https://evil.test'])
            ->push('not json', 200, ['Content-Type' => 'text/html'])]);
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $payment->refresh()->update(['next_check_at' => now()]);
        app(PaymentProcessor::class)->processNext();
        $this->assertSame(Payment::Pending, $payment->fresh()->status);
        $this->assertSame(2, $payment->fresh()->attempts);
        $this->assertNull($payment->fresh()->checkout_url);
        Http::assertSentCount(2);
    }
}
