<?php

namespace Tests\Feature;

use App\Domain\OperationProcessor;
use App\Models\Operation;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\Shop;
use App\Models\User;
use App\Modules\Platform\OrganizationActions;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use PDOException;
use Tests\TestCase;

class OrganizationWorkspaceTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    private Shop $shop;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => str_repeat('x', 32)]);
        config(['platform.applications.framework.available' => true]);
        $this->shop = Shop::create(['slug' => 'workspace', 'name' => 'Workspace']);
        $this->owner = User::factory()->create(['shop_id' => $this->shop->id, 'role' => User::Customer]);
        Sanctum::actingAs($this->owner);
    }

    private function submit(string $method, string $path, array $input = [], ?array $headers = null): array
    {
        $headers ??= ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('f', 64)];
        $response = $this->json($method, '/api/v1/shops/workspace/platform/'.$path, $input, $headers)->assertAccepted();

        return [$response, $headers];
    }

    private function settle(array $submitted): Operation
    {
        [$response, $headers] = $submitted;
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        Sanctum::actingAs($this->owner->fresh());
        $this->getJson($response->json('poll_url'), $headers)->assertOk();

        return Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
    }

    private function organization(string $code = 'alpha'): Organization
    {
        $organization = Organization::factory()->create(['code' => $code]);
        OrganizationMembership::factory()->create(['organization_id' => $organization->id, 'user_id' => $this->owner->id,
            'role' => OrganizationMembership::Owner, 'status' => OrganizationMembership::Active]);
        OrganizationApplication::factory()->create(['organization_id' => $organization->id,
            'application_key' => 'framework', 'state' => OrganizationApplication::Installed]);

        return $organization;
    }

    public function test_create_and_update_are_versioned_and_idempotent(): void
    {
        $headers = ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('f', 64)];
        $first = $this->submit('POST', 'organizations', ['code' => 'new-org', 'name' => 'New'], $headers);
        $this->json('POST', '/api/v1/shops/workspace/platform/organizations', ['code' => 'new-org', 'name' => 'New'], $headers)
            ->assertAccepted()->assertJsonPath('operation_id', $first[0]->json('operation_id'));
        $this->json('POST', '/api/v1/shops/workspace/platform/organizations', ['code' => 'new-org', 'name' => 'Changed'], $headers)->assertConflict();
        $created = $this->settle($first);
        $this->assertSame('succeeded', $created->status);
        $id = $created->result['organization']['id'];
        $this->assertSame(0, $created->result['organization']['version']);
        $this->assertDatabaseHas('organization_memberships', ['organization_id' => $id, 'user_id' => $this->owner->id,
            'role' => OrganizationMembership::Owner, 'status' => OrganizationMembership::Active]);
        $this->assertDatabaseHas('organization_applications', ['organization_id' => $id, 'application_key' => 'framework', 'state' => OrganizationApplication::Installed]);
        $updated = $this->settle($this->submit('PATCH', 'organizations/'.$id, ['name' => 'Renamed', 'expected_version' => 0]));
        $this->assertSame('Renamed', $updated->result['organization']['name']);
        $this->assertSame(1, $updated->result['organization']['version']);
        $stale = $this->settle($this->submit('PATCH', 'organizations/'.$id, ['name' => 'Stale', 'expected_version' => 0]));
        $this->assertSame(409, $stale->http_status);
        $this->assertSame('Renamed', Organization::findOrFail($id)->name);
    }

    public function test_listing_and_applications_are_bounded_scoped_and_public(): void
    {
        $first = $this->organization();
        $this->organization('beta');
        $other = Organization::factory()->create(['code' => 'private']);
        OrganizationApplication::factory()->create(['organization_id' => $first->id, 'application_key' => 'crm', 'state' => OrganizationApplication::Installed]);
        $list = $this->settle($this->submit('GET', 'organizations?page=2&per_page=1'));
        $this->assertSame(2, $list->result['meta']['total']);
        $this->assertCount(1, $list->result['data']);
        $this->assertArrayNotHasKey('user_id', $list->result['data'][0]);
        $this->assertNotSame($other->id, $list->result['data'][0]['id']);
        $apps = $this->settle($this->submit('GET', 'organizations/'.$first->id.'/applications'));
        $this->assertSame(['framework'], array_column($apps->result['data'], 'application_key'));
        $this->assertSame('1.0', $apps->result['data'][0]['contract_version']);
        $this->assertArrayNotHasKey('organization_id', $apps->result['data'][0]);
    }

    public function test_worker_rechecks_membership_and_owner_role_after_acceptance(): void
    {
        $organization = $this->organization();
        $pending = $this->submit('PATCH', 'organizations/'.$organization->id, ['name' => 'Forbidden', 'expected_version' => 0]);
        OrganizationMembership::where('organization_id', $organization->id)->update(['role' => OrganizationMembership::Member]);
        $rejected = $this->settle($pending);
        $this->assertSame(403, $rejected->http_status);
        $this->assertSame($organization->name, $organization->fresh()->name);
        $pending = $this->submit('GET', 'organizations/'.$organization->id);
        OrganizationMembership::where('organization_id', $organization->id)->update(['status' => OrganizationMembership::Revoked]);
        $this->assertSame(404, $this->settle($pending)->http_status);
    }

    public function test_cross_tenant_suspension_deletion_and_bad_input_reject_without_leak(): void
    {
        $other = Organization::factory()->create();
        $this->assertSame(404, $this->settle($this->submit('GET', 'organizations/'.$other->id))->http_status);
        $organization = $this->organization();
        $organization->update(['status' => Organization::Suspended]);
        $this->assertSame(403, $this->settle($this->submit('GET', 'organizations/'.$organization->id))->http_status);
        $organization->update(['status' => Organization::Active]);
        $organization->delete();
        $this->assertSame(404, $this->settle($this->submit('GET', 'organizations/'.$organization->id))->http_status);
        $invalid = $this->settle($this->submit('POST', 'organizations', ['code' => 'BAD', 'name' => 'X', 'status' => 'active']));
        $this->assertSame(422, $invalid->http_status);
        $this->assertArrayHasKey('status', $invalid->result['validation_error']);
        $this->assertArrayNotHasKey('errors', $invalid->result);
    }

    public function test_poll_authorization_rechecks_completed_result(): void
    {
        $organization = $this->organization();
        $detail = $this->submit('GET', 'organizations/'.$organization->id);
        $this->settle($detail);
        $this->assertNotEmpty(app(OrganizationActions::class)->detail($this->owner, $organization->id));
        OrganizationMembership::where('organization_id', $organization->id)->update(['status' => OrganizationMembership::Revoked]);
        $this->getJson($detail[0]->json('poll_url'), $detail[1])->assertNotFound();
    }

    public function test_status_filter_whitespace_name_and_concurrent_duplicate_are_safe(): void
    {
        $this->organization();
        $filtered = $this->settle($this->submit('GET', 'organizations?status=active'));
        $this->assertSame(1, $filtered->result['meta']['total']);
        $invalidPage = $this->settle($this->submit('GET', 'organizations?page=0'));
        $this->assertSame(422, $invalidPage->http_status);
        $this->assertArrayHasKey('page', $invalidPage->result['validation_error']);
        $blank = $this->settle($this->submit('POST', 'organizations', ['code' => 'blank', 'name' => '   ']));
        $this->assertSame(422, $blank->http_status);
        $this->assertArrayHasKey('name', $blank->result['validation_error']);

        $inserted = false;
        Organization::creating(function (Organization $organization) use (&$inserted): void {
            if ($organization->code === 'race' && ! $inserted) {
                $inserted = true;
                DB::table('organizations')->insert(['code' => 'race', 'name' => 'Competing creation',
                    'created_at' => now(), 'updated_at' => now()]);
            }
        });
        $duplicate = $this->settle($this->submit('POST', 'organizations', ['code' => 'race', 'name' => 'New']));
        $this->assertSame(422, $duplicate->http_status);
        $this->assertArrayHasKey('code', $duplicate->result['validation_error']);
        $this->assertDatabaseMissing('organizations', ['code' => 'race']);
    }

    public function test_direct_worker_name_validation_and_database_failure_remain_distinct(): void
    {
        try {
            app(OrganizationActions::class)->create(Request::create('/', 'POST', ['code' => 'direct', 'name' => '   ']), $this->owner);
            $this->fail('Whitespace-only names must be rejected in the worker.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('name', $error->errors());
        }

        Organization::creating(function (Organization $organization): void {
            if ($organization->code === 'dbfailure') {
                throw new QueryException('sqlite', 'insert into organizations', [], new PDOException('Storage failure', 1));
            }
        });
        [$response] = $this->submit('POST', 'organizations', ['code' => 'dbfailure', 'name' => 'New']);
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $operation = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();
        $this->assertSame(Operation::Queued, $operation->status);
        $this->assertSame(500, $operation->http_status);
        $this->assertDatabaseMissing('organizations', ['code' => 'dbfailure']);
    }

    public function test_completed_poll_rechecks_list_create_update_and_application_grants(): void
    {
        $organization = $this->organization();
        $membership = OrganizationMembership::where('organization_id', $organization->id)->firstOrFail();
        $framework = OrganizationApplication::where('organization_id', $organization->id)->firstOrFail();

        $listed = $this->submit('GET', 'organizations');
        $this->settle($listed);
        $membership->update(['status' => OrganizationMembership::Revoked]);
        $this->getJson($listed[0]->json('poll_url'), $listed[1])->assertNotFound();
        $membership->update(['status' => OrganizationMembership::Active]);

        $applications = $this->submit('GET', 'organizations/'.$organization->id.'/applications');
        $this->settle($applications);
        $framework->update(['state' => OrganizationApplication::Disabled]);
        $this->getJson($applications[0]->json('poll_url'), $applications[1])->assertForbidden();
        $framework->update(['state' => OrganizationApplication::Installed]);

        $updated = $this->submit('PATCH', 'organizations/'.$organization->id, ['name' => 'Renamed', 'expected_version' => 0]);
        $this->settle($updated);
        $membership->update(['role' => OrganizationMembership::Member]);
        $this->getJson($updated[0]->json('poll_url'), $updated[1])->assertForbidden();

        $created = $this->submit('POST', 'organizations', ['code' => 'poll-created', 'name' => 'Created']);
        $createdOperation = $this->settle($created);
        OrganizationMembership::where('organization_id', $createdOperation->result['organization']['id'])
            ->update(['status' => OrganizationMembership::Revoked]);
        $this->getJson($created[0]->json('poll_url'), $created[1])->assertNotFound();
    }
}
