<?php

namespace Tests\Feature;

use App\Domain\Assistant\ToolRegistry;
use App\Domain\OperationProcessor;
use App\Models\LoyaltyBalance;
use App\Models\Operation;
use App\Models\PluginInstallation;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PluginTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    private function runCommand(string $method, string $path, array $data = [], int $status = 200): array
    {
        $actor = auth('sanctum')->user();
        $accepted = $this->json($method, '/api/v1/shops/fashion/'.$path, $data)->assertAccepted();
        app(OperationProcessor::class)->processNext();
        if ($actor) {
            Sanctum::actingAs($actor->fresh());
        }
        $operation = Operation::where('public_id', $accepted->json('operation_id'))->firstOrFail();
        $this->assertSame($status, $operation->http_status, json_encode($operation->result));

        return $operation->result;
    }

    private function merchant(): array
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $admin = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Admin]);
        $customer = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Customer]);
        Sanctum::actingAs($admin);

        return [$shop, $admin, $customer];
    }

    public function test_install_filter_update_and_soft_deleted_key_reservation(): void
    {
        [$shop] = $this->merchant();
        $created = $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty']);
        $this->assertFalse($created['plugin']['enabled']);
        $this->assertSame(0, $created['plugin']['version']);
        $this->assertSame('1.0.0', $created['plugin']['manifest']['package_version']);
        $this->assertSame(1, $this->runCommand('GET', 'admin/plugins?page=1&per_page=1&enabled=false&plugin_id=loyalty')['plugins']['meta']['total']);
        $this->assertSame($created['plugin']['id'], $this->runCommand('GET', 'admin/plugins/'.$created['plugin']['id'])['plugin']['id']);
        $this->runCommand('GET', 'admin/plugins?per_page=51', [], 422);
        $this->runCommand('GET', 'admin/plugins?intruder=1', [], 422);
        $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty'], 422);
        $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty', 'source_code' => '<?php'], 422);
        $id = $created['plugin']['id'];
        $this->runCommand('PATCH', "admin/plugins/$id", ['expected_version' => 0, 'enabled' => true, 'customer_enabled' => true, 'max_credit' => 5]);
        $this->runCommand('PATCH', "admin/plugins/$id", ['expected_version' => 0, 'enabled' => false], 409);
        PluginInstallation::whereKey($id)->delete();
        $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty'], 422);
        $this->runCommand('GET', "admin/plugins/$id", [], 404);
        $this->assertSame($shop->id, PluginInstallation::withTrashed()->findOrFail($id)->shop_id);
    }

    public function test_balance_and_credit_are_tenant_scoped_and_revocation_is_checked_by_worker(): void
    {
        [$shop, $admin, $customer] = $this->merchant();
        $otherShop = Shop::create(['slug' => 'electronics', 'name' => 'Electronics']);
        $otherCustomer = User::factory()->create(['shop_id' => $otherShop->id, 'role' => User::Customer]);
        $id = $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty'])['plugin']['id'];
        $this->assertNotContains('loyaltyBalance', array_column(app(ToolRegistry::class)->available($customer, $shop), 'name'));
        $this->runCommand('PATCH', "admin/plugins/$id", ['expected_version' => 0, 'enabled' => true, 'customer_enabled' => true, 'max_credit' => 5]);
        $this->runCommand('POST', 'admin/plugins/loyalty/credit', ['user_id' => $otherCustomer->id, 'points' => 1, 'reason' => 'gift'], 404);
        $this->runCommand('POST', 'admin/plugins/loyalty/credit', ['user_id' => $customer->id, 'points' => 1, 'reason' => 'gift', 'script' => 'code'], 422);
        $this->runCommand('POST', 'admin/plugins/loyalty/credit', ['user_id' => $admin->id, 'points' => 1, 'reason' => 'gift'], 404);
        $this->runCommand('POST', 'admin/plugins/loyalty/credit', ['user_id' => $customer->id, 'points' => 6, 'reason' => 'gift'], 422);
        $this->assertSame(3, $this->runCommand('POST', 'admin/plugins/loyalty/credit', ['user_id' => $customer->id, 'points' => 3, 'reason' => 'gift'])['balance']['points']);
        Sanctum::actingAs($customer->fresh());
        $this->assertContains('loyaltyBalance', array_column(app(ToolRegistry::class)->available($customer, $shop), 'name'));
        $this->assertSame(3, $this->runCommand('GET', 'plugins/loyalty/balance')['balance']['points']);
        $this->runCommand('GET', 'plugins/loyalty/balance?script=code', [], 422);
        $queued = $this->getJson('/api/v1/shops/fashion/plugins/loyalty/balance')->assertAccepted()->json('operation_id');
        PluginInstallation::whereKey($id)->update(['enabled' => false, 'version' => 2]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(403, Operation::where('public_id', $queued)->firstOrFail()->http_status);
        $this->assertNotContains('loyaltyBalance', array_column(app(ToolRegistry::class)->available($customer, $shop), 'name'));
        Sanctum::actingAs($customer->fresh());
        $this->getJson('/api/v1/shops/fashion/plugins/loyalty/balance')->assertForbidden();
    }

    public function test_credit_is_idempotent_and_queued_credit_rechecks_configuration(): void
    {
        [, $admin, $customer] = $this->merchant();
        $id = $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty', 'enabled' => true, 'max_credit' => 5])['plugin']['id'];
        $path = '/api/v1/shops/fashion/admin/plugins/loyalty/credit';
        $payload = ['user_id' => $customer->id, 'points' => 2, 'reason' => 'Purchase'];
        $headers = ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('a', 64)];
        $first = $this->postJson($path, $payload, $headers)->assertAccepted()->json('operation_id');
        app(OperationProcessor::class)->processNext();
        Sanctum::actingAs($admin->fresh());
        $this->assertSame($first, $this->postJson($path, $payload, $headers)->assertAccepted()->json('operation_id'));
        $this->assertDatabaseCount('loyalty_credits', 1);
        $this->assertDatabaseHas('loyalty_balances', ['user_id' => $customer->id, 'points' => 2]);
        $queued = $this->postJson($path, $payload)->assertAccepted()->json('operation_id');
        PluginInstallation::whereKey($id)->update(['enabled' => false, 'version' => 1]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(403, Operation::where('public_id', $queued)->firstOrFail()->http_status);
        $this->assertDatabaseCount('loyalty_credits', 1);
    }

    public function test_assistant_confirmation_rechecks_plugin_enablement(): void
    {
        [$shop, $admin, $customer] = $this->merchant();
        $id = $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty', 'enabled' => true])['plugin']['id'];
        $draft = $this->runCommand('POST', 'assistant', ['action' => 'creditLoyalty', 'data' => ['user_id' => $customer->id, 'points' => 2, 'reason' => 'Purchase']]);
        $this->assertSame('needs_confirmation', $draft['status']);
        PluginInstallation::whereKey($id)->update(['enabled' => false, 'version' => 1]);
        Sanctum::actingAs($admin->fresh());
        $this->runCommand('POST', 'assistant', ['conversation_id' => $draft['conversation_id'], 'conversation_version' => $draft['conversation_version'], 'confirm' => true], 403);
        $this->assertDatabaseCount('loyalty_credits', 0);
    }

    public function test_customer_grant_revocation_and_balance_limit(): void
    {
        [$shop, $admin, $customer] = $this->merchant();
        $id = $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty', 'enabled' => true, 'customer_enabled' => true])['plugin']['id'];
        LoyaltyBalance::create(['shop_id' => $shop->id, 'user_id' => $customer->id, 'points' => 2147483647]);
        $this->runCommand('POST', 'admin/plugins/loyalty/credit', ['user_id' => $customer->id, 'points' => 1, 'reason' => 'Gift'], 422);
        $this->assertDatabaseCount('loyalty_credits', 0);
        Sanctum::actingAs($customer->fresh());
        $queued = $this->getJson('/api/v1/shops/fashion/plugins/loyalty/balance')->assertAccepted()->json('operation_id');
        PluginInstallation::whereKey($id)->update(['customer_enabled' => false, 'version' => 1]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(403, Operation::where('public_id', $queued)->firstOrFail()->http_status);
        $this->assertNotContains('loyaltyBalance', array_column(app(ToolRegistry::class)->available($customer, $shop), 'name'));
        Sanctum::actingAs($admin->fresh());
        $this->assertContains('loyaltyBalance', array_column(app(ToolRegistry::class)->available($admin, $shop), 'name'));
        $tool = app(ToolRegistry::class)->find('loyaltyBalance', $admin, $shop);
        $this->assertSame([User::Admin], app(ToolRegistry::class)->describe($tool, $shop->slug, $shop)['allowed_roles']);
    }

    public function test_assistant_plugin_update_prepares_current_version(): void
    {
        $this->merchant();
        $id = $this->runCommand('POST', 'admin/plugins', ['plugin_id' => 'loyalty'])['plugin']['id'];
        $draft = $this->runCommand('POST', 'assistant', ['action' => 'updatePlugin', 'data' => ['id' => $id, 'enabled' => true]]);
        $this->assertSame(0, $draft['preview']['input']['expected_version']);
        $this->runCommand('POST', 'assistant', ['conversation_id' => $draft['conversation_id'], 'conversation_version' => $draft['conversation_version'], 'confirm' => true]);
        $this->assertTrue(PluginInstallation::findOrFail($id)->enabled);
    }
}
