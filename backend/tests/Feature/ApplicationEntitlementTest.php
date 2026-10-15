<?php

namespace Tests\Feature;

use App\Models\ApplicationEntitlementGrant;
use App\Models\ApplicationEntitlementRevocation;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\Shop;
use App\Models\User;
use App\Modules\Platform\ApplicationActions;
use App\Modules\Platform\OrganizationAccess;
use App\Modules\Platform\OrganizationActions;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PDOException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class ApplicationEntitlementTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $owner = PlatformUser::factory()->create();
        $organization = app(OrganizationActions::class)->create(Request::create('/', 'POST',
            ['code' => 'entitlement-org', 'name' => 'Entitlement Org']), $owner)['organization'];
        config(['platform.applications.crm.available' => true, 'platform.applications.crm.provisioned' => true]);

        return [$owner, $organization['id']];
    }

    private function request(array $body): Request
    {
        return Request::create('/', 'POST', $body);
    }

    private function denied(callable $action, int $status): void
    {
        try {
            $action();
            $this->fail('Expected denied action.');
        } catch (HttpException $error) {
            $this->assertSame($status, $error->getStatusCode());
        }
    }

    public function test_framework_creation_is_atomic_and_free_grant_is_unique(): void
    {
        [$owner, $id] = $this->fixture();
        $this->assertDatabaseHas('application_entitlement_grants', ['organization_id' => $id,
            'application_key' => 'framework', 'source' => ApplicationEntitlementGrant::Free,
            'evidence_ref' => 'framework-create:'.$id]);
        $this->assertSame(1, ApplicationEntitlementGrant::activeFor($id, 'framework')->count());
        $this->assertTrue(app(OrganizationAccess::class)->allows($owner, $id, 'framework'));
        $this->assertSame(0, OrganizationApplication::where('organization_id', $id)->first()->version);
    }

    public function test_entitlement_enables_install_transitions_and_revocation_guards_result(): void
    {
        [$owner, $id] = $this->fixture();
        $actions = app(ApplicationActions::class);
        $this->denied(fn () => $actions->install($this->request(['expected_version' => 0]), $owner, $id, 'crm'), 403);
        $grant = ApplicationEntitlementGrant::factory()->create(['organization_id' => $id, 'application_key' => 'crm',
            'source' => ApplicationEntitlementGrant::Operator]);
        $catalog = $actions->catalog($this->request(['application_key' => 'crm', 'page' => '1', 'per_page' => '1']), $owner, $id);
        $this->assertSame(1, $catalog['meta']['total']);
        $crm = collect($catalog['data'])->firstWhere('application_key', 'crm');
        $this->assertTrue($crm['available']);
        $this->assertTrue($crm['entitled']);
        $this->assertNull($crm['state']);
        $installed = $actions->install($this->request(['expected_version' => 0]), $owner, $id, 'crm');
        $this->assertSame('installed', $installed['application']['state']);
        $this->assertSame(0, $installed['application']['version']);
        $this->denied(fn () => $actions->install($this->request(['expected_version' => 0]), $owner, $id, 'crm'), 409);
        $this->assertTrue(app(OrganizationAccess::class)->allows($owner, $id, 'crm'));
        $disabled = $actions->disable($this->request(['expected_version' => 0]), $owner, $id, 'crm');
        $this->assertSame(1, $disabled['application']['version']);
        $this->assertFalse(app(OrganizationAccess::class)->allows($owner, $id, 'crm'));
        $this->denied(fn () => $actions->reenable($this->request(['expected_version' => 0]), $owner, $id, 'crm'), 409);
        $reenabled = $actions->reenable($this->request(['expected_version' => 1]), $owner, $id, 'crm');
        $this->assertSame(2, $reenabled['application']['version']);
        $actions->authorizeResult($owner, 'platform.application.install', ['id' => $id, 'application_key' => 'crm'], $reenabled);
        ApplicationEntitlementRevocation::factory()->create(['grant_id' => $grant->id]);
        $this->assertFalse(app(OrganizationAccess::class)->allows($owner, $id, 'crm'));
        $this->denied(fn () => $actions->authorizeResult($owner, 'platform.application.install',
            ['id' => $id, 'application_key' => 'crm'], $reenabled), 403);
    }

    public function test_owner_scope_status_provisioning_and_strict_input_are_required(): void
    {
        [$owner, $id] = $this->fixture();
        $actions = app(ApplicationActions::class);
        $other = PlatformUser::factory()->create();
        $this->denied(fn () => $actions->catalog($this->request([]), $other, $id), 404);
        $member = PlatformUser::factory()->create();
        OrganizationMembership::factory()->create(['organization_id' => $id, 'user_id' => null,
            'platform_user_id' => $member->id, 'role' => OrganizationMembership::Member,
            'status' => OrganizationMembership::Active]);
        $actions->catalog($this->request([]), $member, $id);
        $this->denied(fn () => $actions->install($this->request(['expected_version' => 0]), $member, $id, 'crm'), 403);
        $this->denied(fn () => $actions->install($this->request(['expected_version' => 0]), $owner, $id, 'framework'), 403);
        $this->denied(fn () => $actions->install($this->request(['expected_version' => 0]), $owner, $id, 'commerce'), 403);
        try {
            $actions->install($this->request(['expected_version' => 0, 'source' => 'verified_settlement']), $owner, $id, 'crm');
            $this->fail('Client supplied payment authority.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('source', $error->errors());
        }
        config(['platform.applications.crm.provisioned' => false]);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $id, 'application_key' => 'crm',
            'source' => ApplicationEntitlementGrant::Operator]);
        $this->denied(fn () => $actions->install($this->request(['expected_version' => 0]), $owner, $id, 'crm'), 403);
        DB::table('platform_users')->where('id', $owner->id)->update(['account_status' => 'disabled']);
        $this->denied(fn () => $actions->catalog($this->request([]), $owner, $id), 403);
    }

    public function test_expiry_and_framework_revocation_guard_workspace(): void
    {
        [$owner, $id] = $this->fixture();
        $grant = ApplicationEntitlementGrant::activeFor($id, 'framework')->firstOrFail();
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $id, 'application_key' => 'crm',
            'source' => ApplicationEntitlementGrant::Trial, 'starts_at' => now()->subHour(), 'expires_at' => now()->addMinute()]);
        $this->assertTrue(ApplicationEntitlementGrant::activeFor($id, 'crm')->exists());
        $this->travel(2)->minutes();
        $this->assertFalse(ApplicationEntitlementGrant::activeFor($id, 'crm')->exists());
        ApplicationEntitlementRevocation::factory()->create(['grant_id' => $grant->id]);
        $this->assertFalse(app(OrganizationAccess::class)->allows($owner, $id, 'framework'));
        $this->assertSame(0, app(OrganizationActions::class)->listing($this->request([]), $owner)['meta']['total']);
        $this->denied(fn () => app(ApplicationActions::class)->catalog($this->request([]), $owner, $id), 403);
    }

    public function test_evidence_is_append_only_and_backfill_only_grants_historical_framework(): void
    {
        [$owner, $id] = $this->fixture();
        $grant = ApplicationEntitlementGrant::activeFor($id, 'framework')->firstOrFail();
        try {
            DB::transaction(fn () => DB::table('application_entitlement_grants')->where('id', $grant->id)
                ->update(['source' => 'verified_settlement']));
            $this->fail('Grant mutation was accepted.');
        } catch (QueryException) {
            $this->assertSame(ApplicationEntitlementGrant::Free, $grant->fresh()->source);
        }
        $revocation = ApplicationEntitlementRevocation::factory()->create(['grant_id' => $grant->id]);
        try {
            DB::transaction(fn () => DB::table('application_entitlement_revocations')->where('id', $revocation->id)->delete());
            $this->fail('Revocation deletion was accepted.');
        } catch (QueryException) {
            $this->assertDatabaseHas('application_entitlement_revocations', ['id' => $revocation->id]);
        }
        $legacy = Organization::factory()->create(['code' => 'historical']);
        OrganizationApplication::factory()->create(['organization_id' => $legacy->id, 'application_key' => 'framework',
            'state' => OrganizationApplication::Installed]);
        OrganizationApplication::factory()->create(['organization_id' => $legacy->id, 'application_key' => 'commerce',
            'state' => OrganizationApplication::Installed]);
        $migration = require database_path('migrations/2026_10_13_022215_backfill_framework_entitlement_grants.php');
        $migration->up();
        $this->assertDatabaseHas('application_entitlement_grants', ['organization_id' => $legacy->id, 'application_key' => 'framework']);
        $this->assertDatabaseMissing('application_entitlement_grants', ['organization_id' => $legacy->id, 'application_key' => 'commerce']);
        $this->assertSame(1, ApplicationEntitlementGrant::where('organization_id', $legacy->id)->count());
        $this->assertFalse(app(OrganizationAccess::class)->allows($owner, $legacy->id, 'framework'));
    }

    public function test_catalog_rejects_unknown_fields_and_paginates_trusted_definitions(): void
    {
        [$owner, $id] = $this->fixture();
        $actions = app(ApplicationActions::class);
        $first = $actions->catalog($this->request(['page' => '1', 'per_page' => '2']), $owner, $id);
        $this->assertSame(10, $first['meta']['total']);
        $this->assertCount(2, $first['data']);
        $this->assertSame(5, $first['meta']['last_page']);
        $this->assertSame(2, $actions->catalog($this->request(['page' => '2', 'per_page' => '2']), $owner, $id)['meta']['current_page']);
        try {
            $actions->catalog($this->request(['paid' => true]), $owner, $id);
            $this->fail('Catalog accepted an unknown field.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('paid', $error->errors());
        }
        $actions->authorizeResult($owner, 'platform.application.catalog', ['id' => $id], $first);
        $this->denied(fn () => $actions->authorizeResult($owner, 'platform.application.catalog',
            ['id' => $id + 1], $first), 403);
    }

    public function test_install_database_races_map_unique_conflict_and_rethrow_other_failures(): void
    {
        [$owner, $id] = $this->fixture();
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $id, 'application_key' => 'crm',
            'source' => ApplicationEntitlementGrant::Operator]);
        $actions = app(ApplicationActions::class);
        OrganizationApplication::creating(function (OrganizationApplication $application) use ($id): void {
            if ($application->application_key === 'crm') {
                DB::table('organization_applications')->insert(['organization_id' => $id, 'application_key' => 'crm',
                    'state' => 'installed', 'version' => 0, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
        try {
            $this->denied(fn () => $actions->install($this->request(['expected_version' => 0]), $owner, $id, 'crm'), 409);
        } finally {
            OrganizationApplication::flushEventListeners();
        }
        OrganizationApplication::creating(function (OrganizationApplication $application): void {
            if ($application->application_key === 'crm') {
                throw new QueryException('sqlite', 'insert', [], new PDOException('Other failure', 999));
            }
        });
        try {
            $this->expectException(QueryException::class);
            $actions->install($this->request(['expected_version' => 0]), $owner, $id, 'crm');
        } finally {
            OrganizationApplication::flushEventListeners();
        }
    }

    public function test_grant_relationships_and_explicit_time_scope(): void
    {
        [, $id] = $this->fixture();
        $grant = ApplicationEntitlementGrant::activeFor($id, 'framework')->firstOrFail();
        $this->assertSame($id, $grant->organization->id);
        $this->assertIsArray($grant->evidence);
        $this->assertSame(['free', 'trial', 'verified_settlement', 'operator'], array_keys(ApplicationEntitlementGrant::options()));
        $this->assertArrayNotHasKey('evidence_ref', $grant->toArray());
        $this->assertArrayNotHasKey('deleted_at', $grant->toArray());
        $this->assertTrue(ApplicationEntitlementGrant::activeFor($id, 'framework')->activeAt(now()->addSecond())->exists());
        $revocation = ApplicationEntitlementRevocation::factory()->create(['grant_id' => $grant->id]);
        $this->assertSame($grant->id, $revocation->grant->id);
        $this->assertSame($revocation->id, $grant->revocation->id);
        $this->assertArrayNotHasKey('deleted_at', $revocation->toArray());
        $this->assertFalse(ApplicationEntitlementGrant::activeFor($id, 'framework')->exists());
    }

    public function test_platform_and_shop_principals_with_same_numeric_id_cannot_cross_catalogs(): void
    {
        [$platformOwner, $platformOrg] = $this->fixture();
        $shop = Shop::create(['slug' => 'entitlement-shop', 'name' => 'Entitlement Shop']);
        $shopUser = User::factory()->create(['id' => $platformOwner->id, 'shop_id' => $shop->id]);
        $this->assertSame($platformOwner->id, $shopUser->id);
        $shopOrg = app(OrganizationActions::class)->create($this->request(['code' => 'shop-entitlement-org',
            'name' => 'Shop Entitlement Org']), $shopUser)['organization']['id'];
        $actions = app(ApplicationActions::class);
        $this->assertSame($platformOrg, $actions->catalog($this->request([]), $platformOwner, $platformOrg)['meta']['organization_id']);
        $this->assertSame($shopOrg, $actions->catalog($this->request([]), $shopUser, $shopOrg)['meta']['organization_id']);
        $this->denied(fn () => $actions->catalog($this->request([]), $platformOwner, $shopOrg), 404);
        $this->denied(fn () => $actions->catalog($this->request([]), $shopUser, $platformOrg), 404);
    }
}
