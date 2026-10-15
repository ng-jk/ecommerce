<?php

namespace Tests\Feature;

use App\Domain\OperationProcessor;
use App\Models\Operation;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LegacyMembershipBoundaryTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    private function requestAs(User $actor, string $method, string $path, array $input = []): array
    {
        Sanctum::actingAs($actor->fresh());
        $headers = ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('c', 64)];
        $response = $this->json($method, '/api/v1/shops/fashion/'.$path, $input, $headers)->assertAccepted();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $operation = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $this->assertSame(Operation::Succeeded, $operation->status, json_encode($operation->result));
        Sanctum::actingAs($actor->fresh());
        $this->getJson($response->json('poll_url'), $headers)->assertOk();

        return $operation->result;
    }

    private function confirmAs(User $actor, array $draft): array
    {
        $this->assertSame('needs_confirmation', $draft['status']);

        return $this->requestAs($actor, 'POST', 'assistant', ['conversation_id' => $draft['conversation_id'],
            'conversation_version' => $draft['conversation_version'], 'confirm' => true]);
    }

    public function test_all_legacy_membership_worker_routes_preserve_authority_and_ai_versions(): void
    {
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $owner = User::factory()->create(['shop_id' => $shop->id]);
        $recipient = User::factory()->create(['shop_id' => $shop->id]);
        $organization = $this->requestAs($owner, 'POST', 'platform/organizations', ['code' => 'boundary', 'name' => 'Boundary'])['organization'];
        $path = 'platform/organizations/'.$organization['id'].'/memberships';
        $directory = $this->requestAs($owner, 'GET', $path);
        $this->assertCount(1, $directory['data']);
        $invitation = $this->requestAs($owner, 'POST', $path, ['user_id' => $recipient->id, 'role' => 'member'])['membership'];
        $memberPath = $path.'/'.$invitation['id'];
        $this->assertSame('invited', $this->requestAs($recipient, 'GET', $memberPath)['membership']['status']);
        $active = $this->requestAs($recipient, 'POST', $memberPath.'/accept', ['expected_version' => $invitation['version']])['membership'];
        $admin = $this->requestAs($owner, 'PATCH', $memberPath, ['role' => 'admin', 'expected_version' => $active['version']])['membership'];
        $revoked = $this->requestAs($owner, 'POST', $memberPath.'/revoke', ['expected_version' => $admin['version']])['membership'];
        $reinvited = $this->requestAs($owner, 'POST', $path, ['user_id' => $recipient->id, 'role' => 'member', 'expected_version' => $revoked['version']])['membership'];
        $arguments = ['id' => $organization['id'], 'membership_id' => $reinvited['id']];
        $ready = $this->requestAs($recipient, 'POST', 'assistant', ['action' => 'acceptMembership', 'data' => $arguments]);
        $accepted = $this->confirmAs($recipient, $ready);
        $this->assertSame('active', $accepted['api_result']['membership']['status']);
        $ready = $this->requestAs($owner, 'POST', 'assistant', ['action' => 'changeMembershipRole', 'data' => [...$arguments, 'role' => 'admin']]);
        $changed = $this->confirmAs($owner, $ready);
        $this->assertSame('admin', $changed['api_result']['membership']['role']);
        $ready = $this->requestAs($owner, 'POST', 'assistant', ['action' => 'revokeMembership', 'data' => $arguments]);
        $removed = $this->confirmAs($owner, $ready);
        $this->assertSame('revoked', $removed['api_result']['membership']['status']);
    }
}
