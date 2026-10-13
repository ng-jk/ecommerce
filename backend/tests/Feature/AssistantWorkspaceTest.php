<?php

namespace Tests\Feature;

use App\Domain\Assistant\ToolRegistry;
use App\Domain\OperationProcessor;
use App\Models\Operation;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AssistantWorkspaceTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();
        $shop = Shop::create(['slug' => 'fashion', 'name' => 'Fashion']);
        $this->actor = User::factory()->create(['shop_id' => $shop->id]);
        Sanctum::actingAs($this->actor);
        Http::preventStrayRequests();
    }

    public function test_create_requires_confirmation_and_lists_only_my_workspace(): void
    {
        $names = array_column($this->turn(['discover' => true])['available_actions'], 'name');
        foreach (['organizations', 'createOrganization', 'organization', 'updateOrganization', 'organizationApplications'] as $name) {
            $this->assertContains($name, $names);
        }
        $ready = $this->turn(['action' => 'createOrganization', 'data' => ['code' => 'assistant-company', 'name' => 'Company']]);
        $this->assertSame('needs_confirmation', $ready['status']);
        $this->assertDatabaseCount('organizations', 0);
        $done = $this->turn($this->confirm($ready));
        $organization = $done['api_result']['organization'];
        $this->assertTrue($done['api_result']['can_update']);
        $this->assertDatabaseHas('organization_memberships', ['organization_id' => $organization['id'], 'user_id' => $this->actor->id, 'role' => OrganizationMembership::Owner]);
        $listed = $this->turn(['action' => 'organizations', 'data' => ['status' => Organization::Active]]);
        $this->assertSame($organization['id'], $listed['api_result']['data'][0]['id']);
        $this->assertSame(Organization::options(), $listed['api_result']['meta']['options']['status']);
        $this->assertSame($done, $this->turn(['conversation_id' => $done['conversation_id'], 'conversation_version' => $done['conversation_version']]));
        $this->assertDatabaseCount('organizations', 1);
    }

    public function test_rename_uses_server_version_and_rechecks_preview_at_execution(): void
    {
        $organization = $this->createWorkspace();
        $preview = $this->turn(['action' => 'updateOrganization', 'data' => ['id' => $organization['id'], 'name' => 'Updated company']]);
        $this->assertSame($organization['version'], $preview['preview']['input']['expected_version']);
        $done = $this->turn($this->confirm($preview));
        $this->assertSame('Updated company', $done['api_result']['organization']['name']);
        $stale = $this->turn(['action' => 'updateOrganization', 'data' => ['id' => $organization['id'], 'name' => 'Stale change']]);
        Organization::whereKey($organization['id'])->increment('version');
        $this->turn($this->confirm($stale), 409);
        $revoked = $this->turn(['action' => 'updateOrganization', 'data' => ['id' => $organization['id'], 'name' => 'Revoked change']]);
        OrganizationMembership::where('organization_id', $organization['id'])->update(['role' => OrganizationMembership::Member]);
        $this->turn($this->confirm($revoked), 403);
        $this->turn(['action' => 'updateOrganization', 'data' => ['id' => $organization['id'], 'name' => 'Forbidden preview']], 403);
        $this->assertSame('Updated company', Organization::findOrFail($organization['id'])->name);
    }

    public function test_language_read_confirms_and_result_poll_rechecks_membership(): void
    {
        $organization = $this->createWorkspace();
        Http::fake(['http://functiongemma:8000/v1/chat/completions' => Http::response([
            'model' => 'google/functiongemma-270m-it',
            'choices' => [['finish_reason' => 'tool_calls', 'message' => ['role' => 'assistant', 'content' => null,
                'tool_calls' => [['id' => 'workspace_call', 'type' => 'function', 'function' => ['name' => 'organizationApplications', 'arguments' => json_encode(['id' => $organization['id']])]]]]]],
        ])]);
        $ready = $this->turn(['message' => 'Show applications for organization '.$organization['id']]);
        $this->assertSame('needs_confirmation', $ready['status']);
        $done = $this->turn($this->confirm($ready));
        $this->assertSame(['framework'], array_column($done['api_result']['data'], 'application_key'));
        Http::assertSentCount(1);
        OrganizationMembership::where('organization_id', $organization['id'])->update(['status' => OrganizationMembership::Revoked]);
        $operation = Operation::where('action', 'assistant')->latest('id')->firstOrFail();
        Sanctum::actingAs($this->actor->fresh());
        $this->getJson('/api/v1/shops/fashion/operations/'.$operation->public_id)->assertNotFound();
    }

    public function test_registry_uses_organization_options_and_rejects_forged_fields(): void
    {
        $registry = app(ToolRegistry::class);
        config(['platform.applications.framework.available' => false]);
        $this->assertNotContains('createOrganization', array_column($registry->available($this->actor), 'name'));
        $this->turn(['action' => 'createOrganization', 'data' => ['code' => 'disabled-company', 'name' => 'Disabled']], 403);
        config(['platform.applications.framework.available' => true]);
        $tool = $registry->find('organizations', $this->actor);
        $this->assertSame(Organization::options(), $tool['parameters']['properties']['status']['options']);
        $this->assertArrayNotHasKey('expected_version', $registry->find('updateOrganization', $this->actor)['parameters']['properties']);
        $this->assertNotContains('createOrganization', array_column($registry->available(null), 'name'));
        $this->turn(['action' => 'createOrganization', 'data' => ['code' => 'bad-company', 'name' => 'Bad', 'role' => 'owner']], 422);
        $this->assertDatabaseCount('organizations', 0);
    }

    private function createWorkspace(): array
    {
        $ready = $this->turn(['action' => 'createOrganization', 'data' => ['code' => 'assistant-company', 'name' => 'Company']]);

        return $this->turn($this->confirm($ready))['api_result']['organization'];
    }

    private function confirm(array $turn): array
    {
        return ['conversation_id' => $turn['conversation_id'], 'conversation_version' => $turn['conversation_version'], 'confirm' => true];
    }

    private function turn(array $input, int $status = 200): array
    {
        Sanctum::actingAs($this->actor->fresh());
        $response = $this->postJson('/api/v1/shops/fashion/assistant', $input)->assertAccepted();
        app(OperationProcessor::class)->processNext();
        $operation = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $this->assertSame($status, $operation->http_status, json_encode($operation->result));

        return $operation->result;
    }
}
