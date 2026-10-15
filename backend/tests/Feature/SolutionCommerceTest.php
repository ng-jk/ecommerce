<?php

namespace Tests\Feature;

use App\Domain\OperationProcessor;
use App\Domain\Payments\PaymentProcessor;
use App\Domain\SolutionActions;
use App\Domain\SolutionCommerce;
use App\Domain\StoreActions;
use App\Models\ApplicationEntitlementGrant;
use App\Models\ApplicationEntitlementRevocation;
use App\Models\Order;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\Payment;
use App\Models\PlatformUser;
use App\Models\Product;
use App\Models\Shop;
use App\Models\SolutionProvisioning;
use App\Models\User;
use App\Modules\Platform\OrganizationActions;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class SolutionCommerceTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    private function fixture(): array
    {
        config(['platform.applications.crm.available' => true,
            'platform.applications.crm.provisioned' => true,
            'payments.sandbox' => true, 'payments.api_key' => 'test-api']);
        $shop = Shop::create(['slug' => 'solutions', 'name' => 'Solutions']);
        $admin = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Admin]);
        $buyer = User::factory()->create(['shop_id' => $shop->id]);
        $product = Product::create(['shop_id' => $shop->id, 'name' => 'CRM package',
            'category' => 'Solutions', 'description' => 'CRM access',
            'image_url' => 'https://example.test/crm.png', 'price' => 1000, 'stock' => 10]);
        $organization = app(OrganizationActions::class)->create(Request::create('/', 'POST',
            ['code' => 'buyer-org', 'name' => 'Buyer Org']), $buyer)['organization'];
        $offering = app(SolutionCommerce::class)->publish($admin, $product->id, 'crm', ['CRM access']);
        $order = Order::create(['shop_id' => $shop->id, 'solution_offering_id' => $offering['id'],
            'user_id' => $buyer->id,
            'checkout_key' => (string) Str::uuid(), 'items' => [[
                'product_id' => $product->id, 'name' => $product->name,
                'price' => 1000, 'quantity' => 1, 'solution_offering_id' => $offering['id']]],
            'shipping_address' => [],
            'subtotal' => 1000, 'shipping' => 800, 'total' => 1800,
            'status' => Order::Placed, 'payment_method' => 'billplz', 'currency' => 'MYR']);
        $payment = Payment::create(['public_id' => (string) Str::uuid(), 'order_id' => $order->id,
            'status' => Payment::Pending, 'provider' => Payment::Billplz, 'sandbox' => true,
            'collection_id' => 'collection1', 'bill_id' => 'bill1', 'next_check_at' => now()]);

        return [$buyer, $organization['id'], $offering['id'], $order, $payment];
    }

    private function verifyPayment(Payment $payment): void
    {
        Http::preventStrayRequests();
        Http::fake(['https://www.billplz-sandbox.com/api/v3/bills/bill1' => Http::response([
            'id' => 'bill1', 'collection_id' => 'collection1',
            'reference_2' => $payment->public_id, 'amount' => 1800,
            'paid' => true, 'paid_amount' => 1800, 'state' => 'paid',
        ])]);
        $this->assertTrue(app(PaymentProcessor::class)->processNext());
        $this->assertSame(Payment::Paid, $payment->fresh()->status);
    }

    public function test_verified_worker_settlement_grants_once_and_provisioning_waits_for_readiness(): void
    {
        [$buyer, $organizationId, $offeringId, $order, $payment] = $this->fixture();
        $service = app(SolutionCommerce::class);
        $purchase = $service->bind($buyer, $organizationId, $offeringId, $order->id);
        $this->assertSame($purchase, $service->bind($buyer, $organizationId, $offeringId, $order->id));
        $this->assertDatabaseCount('application_entitlement_grants', 1);
        $this->verifyPayment($payment);
        $this->assertDatabaseHas('application_entitlement_grants', [
            'organization_id' => $organizationId, 'application_key' => 'crm',
            'source' => ApplicationEntitlementGrant::VerifiedSettlement,
            'evidence_ref' => 'solution-purchase:'.$purchase['purchase_id'],
        ]);
        $service->settle($payment->fresh(), $order->fresh());
        $this->assertDatabaseCount('solution_provisioning', 1);
        config(['platform.applications.crm.provisioned' => false]);
        $this->assertTrue($service->processProvisioning());
        $this->assertDatabaseHas('solution_provisioning', ['purchase_id' => $purchase['purchase_id'],
            'status' => 'waiting_service']);
        $this->assertDatabaseMissing('organization_applications', [
            'organization_id' => $organizationId, 'application_key' => 'crm']);
        config(['platform.applications.crm.provisioned' => true]);
        DB::table('solution_provisioning')->update(['available_at' => now()]);
        $this->assertTrue($service->processProvisioning());
        $this->assertDatabaseHas('solution_provisioning', ['purchase_id' => $purchase['purchase_id'],
            'status' => 'completed']);
        $this->assertDatabaseHas('organization_applications', [
            'organization_id' => $organizationId, 'application_key' => 'crm', 'state' => 'installed']);
    }

    public function test_purchase_requires_matching_order_and_explicit_owner_principal(): void
    {
        [$buyer, $organizationId, $offeringId, $order, $payment] = $this->fixture();
        $service = app(SolutionCommerce::class);
        $other = User::factory()->create(['shop_id' => $buyer->shop_id, 'email' => $buyer->email.'x']);
        try {
            $service->bind($other, $organizationId, $offeringId, $order->id);
            $this->fail('Another shop user bound the order.');
        } catch (HttpException $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
        $otherOrder = Order::create(['shop_id' => $buyer->shop_id,
            'solution_offering_id' => $offeringId, 'user_id' => $buyer->id,
            'checkout_key' => (string) Str::uuid(), 'items' => [[
                'product_id' => 9999, 'price' => 1000, 'quantity' => 1,
                'solution_offering_id' => $offeringId]], 'shipping_address' => [],
            'subtotal' => 1000, 'shipping' => 800, 'total' => 1800,
            'status' => Order::Placed, 'payment_method' => 'billplz', 'currency' => 'MYR']);
        Payment::create(['public_id' => (string) Str::uuid(), 'order_id' => $otherOrder->id,
            'status' => Payment::Pending, 'provider' => Payment::Billplz,
            'sandbox' => true, 'collection_id' => 'collection1',
            'bill_id' => 'bill-other', 'next_check_at' => now()]);
        try {
            $service->bind($buyer, $organizationId, $offeringId, $otherOrder->id);
            $this->fail('A different product bought the solution.');
        } catch (HttpException $error) {
            $this->assertSame(422, $error->getStatusCode());
        }
        $this->assertDatabaseCount('solution_purchases', 0);
        $this->assertDatabaseCount('solution_provisioning', 0);
    }

    public function test_publishing_keeps_one_application_per_product(): void
    {
        [$buyer, $organizationId, $firstOfferingId, $order] = $this->fixture();
        $admin = User::query()->where('role', User::Admin)->firstOrFail();
        $productId = Product::firstOrFail()->id;
        $second = app(SolutionCommerce::class)->publish($admin, $productId, 'crm', ['Revised CRM access']);
        $this->assertGreaterThan($firstOfferingId, $second['id']);
        $purchase = app(SolutionCommerce::class)->bind($buyer, $organizationId, $firstOfferingId, $order->id);
        $this->assertNotNull($purchase['purchase_id']);
        config(['platform.applications.hr.available' => true, 'platform.applications.hr.provisioned' => true]);
        try {
            app(SolutionCommerce::class)->publish($admin, $productId, 'hr', ['HR access']);
            $this->fail('A product was repurposed for a different application.');
        } catch (HttpException $error) {
            $this->assertSame(422, $error->getStatusCode());
        }
    }

    public function test_checkout_pins_offering_version_before_payment_and_binding(): void
    {
        [$buyer, $organizationId, $offeringId] = $this->fixture();
        $productId = Product::firstOrFail()->id;
        config(['payments.driver' => 'billplz', 'payments.enabled.solutions' => ['billplz'],
            'payments.api_key' => 'test-api', 'payments.signature_key' => 'test-signature',
            'payments.collections.solutions' => 'collection1',
            'payments.webhook_base' => 'https://example.test',
            'payments.returns.solutions' => 'https://example.test/return']);
        $buyer->forceFill(['cart' => [['product_id' => $productId, 'quantity' => 1]]])->save();
        $request = Request::create('/', 'POST', ['checkout_key' => (string) Str::uuid(),
            'payment_method' => 'billplz', 'shipping_address' => [
                'name' => 'Buyer', 'line1' => '1 Main Street', 'city' => 'Kuala Lumpur',
                'postcode' => '50000', 'country' => 'MY']]);
        $request->setUserResolver(fn () => $buyer);
        $checkout = app(StoreActions::class)->checkout($request, Shop::firstOrFail());
        $order = $checkout['order'];
        $this->assertSame($offeringId, $order->solution_offering_id);
        $this->assertSame($offeringId, $order->items[0]['solution_offering_id']);
        $admin = User::query()->where('role', User::Admin)->firstOrFail();
        $new = app(SolutionCommerce::class)->publish($admin, $productId, 'crm', ['Revised CRM access']);
        try {
            app(SolutionCommerce::class)->bind($buyer, $organizationId, $new['id'], $order->id);
            $this->fail('A later offering version was substituted for the checkout quote.');
        } catch (HttpException $error) {
            $this->assertSame(422, $error->getStatusCode());
        }
        $purchase = app(SolutionCommerce::class)->bind($buyer, $organizationId, $offeringId, $order->id);
        $this->assertNotNull($purchase['purchase_id']);
    }

    public function test_solution_quote_is_immutable_and_simulated_checkout_is_refused(): void
    {
        [$buyer, , $offeringId, $order] = $this->fixture();
        try {
            DB::transaction(fn () => DB::table('orders')->where('id', $order->id)->update(['solution_offering_id' => null]));
            $this->fail('A pinned offering was removed from the persisted quote.');
        } catch (QueryException $error) {
            $this->assertStringContainsString('Solution order quote is immutable', $error->getMessage());
        }
        $this->assertSame($offeringId, $order->fresh()->solution_offering_id);
        config(['payments.driver' => 'simulated', 'payments.enabled.solutions' => ['simulated']]);
        $buyer->forceFill(['cart' => [['product_id' => Product::firstOrFail()->id, 'quantity' => 1]]])->save();
        $request = Request::create('/', 'POST', ['checkout_key' => (string) Str::uuid(),
            'shipping_address' => ['name' => 'Buyer', 'line1' => '1 Main Street',
                'city' => 'Kuala Lumpur', 'postcode' => '50000', 'country' => 'MY']]);
        $request->setUserResolver(fn () => $buyer);
        try {
            app(StoreActions::class)->checkout($request, Shop::firstOrFail());
            $this->fail('A simulated payment could purchase a solution.');
        } catch (HttpException $error) {
            $this->assertSame(422, $error->getStatusCode());
        }
        $this->assertDatabaseCount('orders', 1);
    }

    public function test_bind_after_verified_settlement_reconciles_and_revocation_stops_provisioning(): void
    {
        [$buyer, $organizationId, $offeringId, $order, $payment] = $this->fixture();
        $this->verifyPayment($payment);
        $this->assertDatabaseCount('solution_provisioning', 0);
        $service = app(SolutionCommerce::class);
        $purchase = $service->bind($buyer, $organizationId, $offeringId, $order->id);
        $grant = ApplicationEntitlementGrant::query()->where('evidence_ref',
            'solution-purchase:'.$purchase['purchase_id'])->firstOrFail();
        ApplicationEntitlementRevocation::create(['grant_id' => $grant->id,
            'reason' => 'Verified refund', 'evidence_ref' => 'verified-refund:test', 'revoked_at' => now()]);
        $this->assertTrue($service->processProvisioning());
        $this->assertDatabaseHas('solution_provisioning', ['purchase_id' => $purchase['purchase_id'],
            'status' => 'revoked']);
        $this->assertDatabaseMissing('organization_applications', [
            'organization_id' => $organizationId, 'application_key' => 'crm']);
    }

    public function test_shop_operation_routes_publish_and_bind_with_current_owner_authority(): void
    {
        [$buyer, $organizationId, $offeringId, $order] = $this->fixture();
        config(['app.key' => str_repeat('x', 32)]);
        $headers = ['Idempotency-Key' => (string) Str::uuid(),
            'X-Operation-Token' => str_repeat('a', 64)];
        Sanctum::actingAs($buyer);
        $path = '/api/v1/shops/solutions/platform/organizations/'.$organizationId.'/solution-purchases';
        $accepted = $this->postJson($path, ['offering_id' => $offeringId,
            'order_id' => $order->id], $headers)->assertAccepted();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        Sanctum::actingAs($buyer->fresh());
        $this->getJson($accepted->json('poll_url'), $headers)->assertOk()
            ->assertJsonPath('status', 'succeeded')
            ->assertJsonPath('result.organization_id', $organizationId);
        $this->assertDatabaseCount('solution_purchases', 1);
        $listing = $this->getJson('/api/v1/shops/solutions/solutions/offerings?page=1&per_page=1',
            ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('b', 64)])
            ->assertAccepted();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        Sanctum::actingAs($buyer->fresh());
        $this->getJson($listing->json('poll_url'), ['X-Operation-Token' => str_repeat('b', 64)])
            ->assertOk()->assertJsonPath('result.meta.total', 1);
    }

    private function completedOperation(string $method, string $path, array $body = [], bool $platform = false): array
    {
        $headers = ['Idempotency-Key' => (string) Str::uuid(),
            'X-Operation-Token' => str_repeat('c', 64)];
        $base = $platform ? '/api/v1/platform/' : '/api/v1/shops/solutions/';
        $accepted = $this->json($method, $base.$path, $body, $headers)->assertAccepted();
        $actor = $platform ? PlatformUser::query()->findOrFail(auth('sanctum')->id())
            : User::query()->findOrFail(auth('sanctum')->id());
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        Sanctum::actingAs($actor->fresh(), $platform ? ['platform'] : ['*']);
        $response = $this->getJson($accepted->json('poll_url'), $headers)->assertOk()
            ->assertJsonPath('status', 'succeeded');

        return $response->json('result');
    }

    public function test_all_solution_api_commands_have_authorized_success_paths(): void
    {
        [$buyer, $organizationId, $offeringId, $order, $payment] = $this->fixture();
        config(['app.key' => str_repeat('x', 32)]);
        $admin = User::query()->where('role', User::Admin)->firstOrFail();
        Sanctum::actingAs($admin);
        $published = $this->completedOperation('POST', 'admin/solutions/offerings', [
            'product_id' => Product::firstOrFail()->id, 'application_key' => 'crm',
            'deliverables' => ['CRM workspace']], false);
        $this->assertSame(2, $published['offering']['version']);
        $this->assertSame(2, $this->completedOperation('GET', 'solutions/offerings?page=1&per_page=1')['meta']['total']);
        $this->assertSame($offeringId, $this->completedOperation('GET',
            'solutions/offerings/'.$offeringId)['offering']['id']);
        Sanctum::actingAs($buyer);
        $path = 'platform/organizations/'.$organizationId.'/solution-purchases';
        $bound = $this->completedOperation('POST', $path, [
            'offering_id' => $offeringId, 'order_id' => $order->id]);
        $purchaseId = $bound['purchase_id'];
        $this->assertSame($purchaseId, $this->completedOperation('GET', $path.'?page=1&per_page=1')['data'][0]['id']);
        $this->assertSame('awaiting_settlement', $this->completedOperation('GET',
            $path.'/detail?purchase_id='.$purchaseId)['status']);
        $this->verifyPayment($payment);
        DB::table('solution_provisioning')->where('purchase_id', $purchaseId)->update(['status' => 'failed']);
        $this->assertSame('queued', $this->completedOperation('POST', $path.'/retry',
            ['purchase_id' => $purchaseId])['status']);
        DB::table('solution_provisioning')->where('purchase_id', $purchaseId)->update(['status' => 'failed']);

        $platform = PlatformUser::factory()->create();
        OrganizationMembership::factory()->create(['organization_id' => $organizationId,
            'user_id' => null, 'platform_user_id' => $platform->id,
            'role' => OrganizationMembership::Owner, 'status' => OrganizationMembership::Active]);
        Sanctum::actingAs($platform, ['platform']);
        $standalone = 'organizations/'.$organizationId.'/solution-purchases';
        $this->assertSame($purchaseId, $this->completedOperation('GET', $standalone, [], true)['data'][0]['id']);
        $this->assertSame('failed', $this->completedOperation('GET',
            $standalone.'/detail?purchase_id='.$purchaseId, [], true)['status']);
        $this->assertSame('queued', $this->completedOperation('POST',
            $standalone.'/retry', ['purchase_id' => $purchaseId], true)['status']);
    }

    public function test_offering_filter_lower_layer_deliverables_and_public_result_scope(): void
    {
        [$buyer] = $this->fixture();
        $service = app(SolutionCommerce::class);
        $shopId = Shop::firstOrFail()->id;
        $filtered = $service->offerings(Request::create('/', 'GET', ['application_key' => 'hr']), $shopId);
        $this->assertSame(0, $filtered['meta']['total']);
        $this->assertSame([], $filtered['data']);
        $service->authorizeResult($buyer, 'solutions.offerings', [], []);
        $this->assertTrue(true);
        $admin = User::query()->where('role', User::Admin)->firstOrFail();
        try {
            $service->publish($admin, Product::firstOrFail()->id, 'crm', ['   ']);
            $this->fail('Blank lower-layer deliverables were published.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('deliverables', $error->errors());
        }
        $this->assertDatabaseCount('solution_offerings', 1);
    }

    public function test_settlement_requires_verified_paid_state_and_matching_purchase_quote(): void
    {
        [$buyer, $organizationId, $offeringId, $order, $payment] = $this->fixture();
        $service = app(SolutionCommerce::class);
        $purchase = $service->bind($buyer, $organizationId, $offeringId, $order->id);
        $service->settle($payment, $order);
        $this->assertDatabaseMissing('solution_provisioning', ['purchase_id' => $purchase['purchase_id']]);
        $this->verifyPayment($payment);
        $this->assertDatabaseHas('solution_provisioning', ['purchase_id' => $purchase['purchase_id']]);
        try {
            $differentOrder = clone $order;
            $differentOrder->id = $order->id + 1;
            $service->settle($payment->fresh(), $differentOrder);
            $this->fail('A verified payment settled against the wrong purchase order.');
        } catch (\UnexpectedValueException $error) {
            $this->assertSame('Solution purchase does not match verified payment.', $error->getMessage());
        }
        $this->assertDatabaseCount('solution_provisioning', 1);
    }

    public function test_provisioning_respects_existing_installed_and_disabled_states(): void
    {
        [$buyer, $organizationId, $offeringId, $order, $payment] = $this->fixture();
        $service = app(SolutionCommerce::class);
        $purchase = $service->bind($buyer, $organizationId, $offeringId, $order->id);
        $this->verifyPayment($payment);
        $installation = OrganizationApplication::create(['organization_id' => $organizationId,
            'application_key' => 'crm', 'state' => OrganizationApplication::Disabled]);
        $this->assertTrue($service->processProvisioning());
        $this->assertDatabaseHas('solution_provisioning', ['purchase_id' => $purchase['purchase_id'],
            'status' => SolutionProvisioning::WaitingInstallation]);
        $this->assertSame(OrganizationApplication::Disabled, $installation->fresh()->state);
        $installation->update(['state' => OrganizationApplication::Installed]);
        DB::table('solution_provisioning')->where('purchase_id', $purchase['purchase_id'])
            ->update(['available_at' => now()]);
        $this->assertTrue($service->processProvisioning());
        $this->assertDatabaseHas('solution_provisioning', ['purchase_id' => $purchase['purchase_id'],
            'status' => SolutionProvisioning::Completed]);
    }

    public function test_provisioning_exhaustion_is_failed_until_explicit_owner_retry(): void
    {
        [$buyer, $organizationId, $offeringId, $order, $payment] = $this->fixture();
        $service = app(SolutionCommerce::class);
        $purchase = $service->bind($buyer, $organizationId, $offeringId, $order->id);
        $this->verifyPayment($payment);
        config(['platform.applications.crm.provisioned' => false]);
        DB::table('solution_provisioning')->where('purchase_id', $purchase['purchase_id'])
            ->update(['attempts' => 11, 'available_at' => now()]);
        $this->assertTrue($service->processProvisioning());
        $this->assertDatabaseHas('solution_provisioning', ['purchase_id' => $purchase['purchase_id'],
            'status' => SolutionProvisioning::Failed, 'attempts' => 12]);
        $this->assertFalse($service->processProvisioning());
        $this->assertSame(SolutionProvisioning::Queued,
            $service->retryProvisioning($buyer, $organizationId, $purchase['purchase_id'])['status']);
        config(['platform.applications.crm.provisioned' => true]);
        $this->assertTrue($service->processProvisioning());
        $this->assertDatabaseHas('solution_provisioning', ['purchase_id' => $purchase['purchase_id'],
            'status' => SolutionProvisioning::Completed]);
    }

    public function test_solution_action_rejects_unknown_field_before_creating_purchase(): void
    {
        [$buyer, $organizationId, $offeringId, $order] = $this->fixture();
        try {
            app(SolutionActions::class)->bind(Request::create('/', 'POST', [
                'offering_id' => $offeringId, 'order_id' => $order->id, 'paid' => true]), $buyer, $organizationId);
            $this->fail('A caller-supplied paid flag was accepted.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('paid', $error->errors());
        }
        $this->assertDatabaseCount('solution_purchases', 0);
    }

    public function test_postgresql_product_search_finds_solution_by_name(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('PostgreSQL full-text search is PostgreSQL-specific.');
        }
        $this->fixture();
        $result = app(StoreActions::class)->products(Request::create('/', 'GET', ['search' => 'CRM']), Shop::firstOrFail());
        $this->assertSame(1, $result['products']['meta']['total']);
    }
}
