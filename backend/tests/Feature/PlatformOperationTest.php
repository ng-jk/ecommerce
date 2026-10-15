<?php

namespace Tests\Feature;

use App\Domain\OperationProcessor;
use App\Models\Operation;
use App\Models\PlatformUser;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlatformOperationTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    private function headers(): array
    {
        return ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('b', 64)];
    }

    public function test_platform_registration_is_durable_shop_independent_and_private(): void
    {
        $headers = $this->headers();
        $input = ['name' => 'Platform owner', 'email' => 'owner@example.test', 'password' => 'long-password-123',
            'password_confirmation' => 'long-password-123', 'device_name' => 'test'];
        $accepted = $this->postJson('/api/v1/platform/auth/register', $input, $headers)->assertAccepted();
        $this->assertDatabaseCount('platform_users', 0);
        $operation = Operation::where('public_id', $accepted->json('operation_id'))->firstOrFail();
        $this->assertNull($operation->shop_id);
        $this->assertNull($operation->user_id);
        $this->postJson('/api/v1/platform/auth/register', $input, $headers)->assertAccepted()
            ->assertJsonPath('operation_id', $operation->public_id);
        $this->postJson('/api/v1/platform/auth/register', [...$input, 'name' => 'Changed'], $headers)->assertConflict();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $operation->refresh();
        $this->assertSame(Operation::Succeeded, $operation->status);
        $this->assertSame([], $operation->payload);
        $poll = $accepted->json('poll_url');
        $result = $this->getJson($poll, $headers)->assertOk()->assertJsonPath('http_status', 200);
        $this->assertNotEmpty($result->json('result.token'));
        $this->assertNull($result->json('result.auth_version'));
        $this->getJson($poll, ['X-Operation-Token' => str_repeat('c', 64)])->assertNotFound();
        PlatformUser::where('email', 'owner@example.test')->increment('auth_version');
        $this->getJson($poll, $headers)->assertForbidden();
    }

    public function test_legacy_principal_cannot_enter_platform_and_revocation_is_rechecked(): void
    {
        $shop = Shop::create(['slug' => 'legacy', 'name' => 'Legacy']);
        Sanctum::actingAs(User::factory()->create(['shop_id' => $shop->id]));
        $this->getJson('/api/v1/platform/auth/me', $this->headers())->assertForbidden();
        Auth::forgetGuards();
        $user = PlatformUser::factory()->create();
        Sanctum::actingAs($user, ['platform']);
        $headers = $this->headers();
        $accepted = $this->getJson('/api/v1/platform/auth/me', $headers)->assertAccepted();
        $user->increment('auth_version');
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $operation = Operation::where('public_id', $accepted->json('operation_id'))->firstOrFail();
        $this->assertSame(Operation::Rejected, $operation->status);
        $this->assertSame(403, $operation->http_status);
        Sanctum::actingAs($user->fresh(), ['platform']);
        $this->getJson($accepted->json('poll_url'), $headers)->assertForbidden();
    }
}
