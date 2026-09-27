<?php

namespace Tests\Feature;

use App\Domain\AccessPolicy;
use App\Domain\Assistant\ToolRegistry;
use App\Domain\OperationProcessor;
use App\Models\Operation;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccessPolicyTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    public function test_configuration_restricts_discovery_and_direct_requests(): void
    {
        Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        config(['commerce.actions.catalog' => ['enabled' => true, 'roles' => ['admin']]]);
        $this->getJson('/api/v1/shops/fashion/products')->assertForbidden();
        $this->assertNotContains('catalog', array_column(app(ToolRegistry::class)->available(null), 'name'));
        $this->assertFalse(app(AccessPolicy::class)->allows('missing', null));
        config(['commerce.actions.catalog' => ['enabled' => true, 'roles' => 'guest']]);
        $this->assertSame([], app(AccessPolicy::class)->roles('catalog'));
    }

    public function test_queued_work_and_confirmation_recheck_disabled_actions(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $user = User::factory()->create(['shop_id' => $shop->id, 'role' => 'customer']);
        Sanctum::actingAs($user);
        $queued = $this->getJson('/api/v1/shops/fashion/cart')->assertAccepted()->json('operation_id');
        // Dot-separated action names are literal keys in the configuration map.
        $rules = config('commerce.actions');
        $rules['cart.read']['enabled'] = false;
        config(['commerce.actions' => $rules]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(403, Operation::where('public_id', $queued)->firstOrFail()->http_status);
        Sanctum::actingAs($user->fresh());
        $pending = $this->postJson('/api/v1/shops/fashion/assistant', ['action' => 'updateCart', 'data' => ['items' => []]])->assertAccepted()->json('operation_id');
        app(OperationProcessor::class)->processNext();
        $draft = Operation::where('public_id', $pending)->firstOrFail()->result;
        $rules['cart.update']['enabled'] = false;
        config(['commerce.actions' => $rules]);
        Sanctum::actingAs($user->fresh());
        $confirm = $this->postJson('/api/v1/shops/fashion/assistant', ['conversation_id' => $draft['conversation_id'], 'conversation_version' => $draft['conversation_version'], 'confirm' => true])->assertAccepted()->json('operation_id');
        app(OperationProcessor::class)->processNext();
        $this->assertSame(403, Operation::where('public_id', $confirm)->firstOrFail()->http_status);
        $this->assertSame(0, $user->fresh()->version);
    }

    public function test_configuration_cannot_grant_customer_admin_privileges(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $user = User::factory()->create(['shop_id' => $shop->id, 'role' => 'customer']);
        $rules = config('commerce.actions');
        $rules['admin.create']['roles'] = ['guest', 'customer', 'admin'];
        $rules['auth.me']['enabled'] = false;
        config(['commerce.actions' => $rules]);
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/shops/fashion/admin/products', [])->assertForbidden();
        $this->getJson('/api/v1/shops/fashion/auth/me')->assertForbidden();
        $this->assertNotContains('createProduct', array_column(app(ToolRegistry::class)->available($user), 'name'));
        $user->account_status = 'disabled';
        $this->assertFalse(app(AccessPolicy::class)->allows('catalog', $user));
    }

    public function test_adding_an_unknown_action_to_config_does_not_create_an_executable_command(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $user = User::factory()->create(['shop_id' => $shop->id, 'role' => 'customer']);
        Sanctum::actingAs($user);
        $id = $this->getJson('/api/v1/shops/fashion/cart')->assertAccepted()->json('operation_id');
        $operation = Operation::where('public_id', $id)->firstOrFail();
        $operation->update(['action' => 'invented']);
        $rules = config('commerce.actions');
        $rules['invented'] = ['enabled' => true, 'roles' => ['customer']];
        config(['commerce.actions' => $rules]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(422, $operation->fresh()->http_status);
        $this->assertSame(['validation_error' => ['action' => ['Unknown command.']]], $operation->fresh()->result);
    }

    public function test_every_business_action_has_an_explicit_permission_configuration(): void
    {
        $names = array_column(array_filter(app(ToolRegistry::class)->all(), fn ($tool) => $tool['callable']), 'action');
        $this->assertEqualsCanonicalizing($names, array_keys(config('commerce.actions')));
        $this->assertSame(['guest', 'customer', 'admin'], app(AccessPolicy::class)->roles('catalog'));
    }
}
