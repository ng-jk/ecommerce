<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\Shop;
use App\Models\User;
use App\Modules\Platform\OrganizationAccess;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class OrganizationFoundationTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $shop = Shop::create(['slug' => 'foundation-shop', 'name' => 'Foundation Shop']);
        $user = User::factory()->create(['shop_id' => $shop->id, 'role' => User::Admin]);
        $organization = Organization::factory()->create(['code' => 'alpha', 'name' => 'Alpha']);
        $membership = OrganizationMembership::factory()->create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => OrganizationMembership::Member,
            'status' => OrganizationMembership::Active,
        ]);
        $application = OrganizationApplication::factory()->create([
            'organization_id' => $organization->id,
            'application_key' => 'framework',
            'state' => OrganizationApplication::Installed,
        ]);
        config(['platform.applications.framework.available' => true]);

        return compact('user', 'organization', 'membership', 'application');
    }

    public function test_access_uses_current_organization_membership_user_and_installation_state(): void
    {
        ['user' => $user, 'organization' => $organization, 'membership' => $membership, 'application' => $application] = $this->fixture();
        $access = app(OrganizationAccess::class);

        $this->assertTrue($access->allows($user, $organization->id, 'framework'));
        $access->enforce($user, $organization->id, 'framework');
        $this->assertFalse($access->allows(null, $organization->id, 'framework'));
        $this->assertFalse($access->allows($user, $organization->id, 'framework', 'invented'));
        $this->assertFalse($access->allows($user, $organization->id, 'unknown'));
        $this->assertFalse($access->allows(new User, $organization->id, 'framework'));
        config(['platform.applications.framework' => 'true']);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        config(['platform.applications.framework' => (object) ['available' => true]]);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        config(['platform.applications.framework.available' => false]);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        config(['platform.applications.framework.available' => true]);
        $this->assertFalse($access->allows($user, $organization->id, 'framework', OrganizationMembership::Admin));
        $membership->update(['role' => OrganizationMembership::Admin]);
        $this->assertTrue($access->allows($user, $organization->id, 'framework', OrganizationMembership::Admin));
        $this->assertFalse($access->allows($user, $organization->id, 'framework', OrganizationMembership::Owner));
        $membership->update(['role' => OrganizationMembership::Owner]);
        $this->assertTrue($access->allows($user, $organization->id, 'framework', OrganizationMembership::Owner));
        $membership->update(['role' => 'unknown']);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        $membership->update(['role' => OrganizationMembership::Member, 'status' => OrganizationMembership::Revoked]);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        $membership->update(['status' => OrganizationMembership::Active]);
        $application->update(['state' => OrganizationApplication::Disabled]);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        $application->update(['state' => OrganizationApplication::Installed]);
        $organization->update(['status' => Organization::Suspended]);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        $organization->update(['status' => Organization::Active]);
        DB::table('users')->where('id', $user->id)->update(['account_status' => 'disabled']);
        $this->assertSame('active', $user->account_status);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        config(['platform.applications' => 'invalid']);
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
    }

    public function test_soft_deleted_records_and_other_tenants_never_grant_access(): void
    {
        ['user' => $user, 'organization' => $organization, 'membership' => $membership, 'application' => $application] = $this->fixture();
        $access = app(OrganizationAccess::class);
        $other = Organization::create(['code' => 'beta', 'name' => 'Beta']);
        $this->assertFalse($access->allows($user, $other->id, 'framework'));
        $otherUser = User::factory()->create(['shop_id' => $user->shop_id, 'role' => User::Admin]);
        $this->assertFalse($access->allows($otherUser, $organization->id, 'framework'));
        $membership->delete();
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        $membership->restore();
        $application->delete();
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        $application->restore();
        $organization->delete();
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
        $organization->restore();
        $user->delete();
        $this->assertFalse($access->allows($user, $organization->id, 'framework'));
    }

    public function test_relationships_and_factory_defaults_keep_new_access_inactive(): void
    {
        ['user' => $user, 'organization' => $organization, 'membership' => $membership, 'application' => $application] = $this->fixture();
        $otherUser = User::factory()->create(['shop_id' => $user->shop_id]);
        $invitation = OrganizationMembership::factory()->create([
            'organization_id' => $organization->id,
            'user_id' => $otherUser->id,
        ]);
        $disabledApplication = OrganizationApplication::factory()->create([
            'organization_id' => $organization->id,
            'application_key' => 'crm',
        ]);

        $this->assertSame(OrganizationMembership::Member, $invitation->role);
        $this->assertSame(OrganizationMembership::Invited, $invitation->status);
        $this->assertSame(OrganizationApplication::Disabled, $disabledApplication->state);
        $this->assertSame($organization->id, $membership->organization->id);
        $this->assertSame($user->id, $membership->user->id);
        $this->assertSame($organization->id, $application->organization->id);
        $this->assertCount(2, $organization->memberships);
        $this->assertCount(2, $organization->applications);
        $access = app(OrganizationAccess::class);
        $this->assertFalse($access->allows($otherUser, $organization->id, 'framework'));
        config(['platform.applications.crm.available' => true]);
        $this->assertFalse($access->allows($user, $organization->id, 'crm'));
        $this->assertFalse($access->allows(new User, $organization->id, 'framework'));
    }

    public function test_granted_application_listing_is_authorized_paginated_and_bounded(): void
    {
        ['user' => $user, 'organization' => $organization, 'membership' => $membership] = $this->fixture();
        $access = app(OrganizationAccess::class);
        OrganizationApplication::create(['organization_id' => $organization->id, 'application_key' => 'commerce', 'state' => OrganizationApplication::Installed]);
        OrganizationApplication::create(['organization_id' => $organization->id, 'application_key' => 'unknown', 'state' => OrganizationApplication::Installed]);
        config(['platform.applications.unknown' => ['available' => true]]);
        $first = $access->grantedApplications($user, $organization->id, 1, 1);
        $this->assertSame(2, $first->total());
        $this->assertSame(['framework'], $first->pluck('application_key')->all());
        $this->assertSame(['commerce'], $access->grantedApplications($user, $organization->id, 2, 1)->pluck('application_key')->all());
        $this->assertSame(0, $access->grantedApplications(null, $organization->id)->total());
        $membership->delete();
        $this->assertSame(0, $access->grantedApplications($user, $organization->id)->total());

        foreach ([[0, 1], [1, 0], [1, 51]] as [$page, $perPage]) {
            try {
                $access->grantedApplications($user, $organization->id, $page, $perPage);
                $this->fail('Invalid pagination values should be rejected.');
            } catch (InvalidArgumentException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_database_uniqueness_survives_soft_deletion_and_models_hide_metadata(): void
    {
        ['user' => $user, 'organization' => $organization, 'membership' => $membership, 'application' => $application] = $this->fixture();
        $this->assertSame(['active' => 'Active', 'suspended' => 'Suspended'], Organization::options());
        $this->assertArrayHasKey('owner', OrganizationMembership::options());
        $this->assertArrayHasKey('revoked', OrganizationMembership::options('status'));
        $this->assertSame([], OrganizationMembership::options('invalid'));
        $this->assertArrayHasKey('installed', OrganizationApplication::options());
        $this->assertArrayNotHasKey('deleted_at', $organization->toArray());
        $this->assertArrayNotHasKey('user_id', $membership->toArray());
        $this->assertArrayNotHasKey('organization_id', $application->toArray());

        $membership->delete();
        $application->delete();
        $organization->delete();
        foreach ([
            fn () => Organization::create(['code' => 'alpha', 'name' => 'Duplicate']),
            fn () => OrganizationMembership::create(['organization_id' => $organization->id, 'user_id' => $user->id]),
            fn () => OrganizationApplication::create(['organization_id' => $organization->id, 'application_key' => 'framework']),
        ] as $duplicate) {
            try {
                DB::transaction($duplicate);
                $this->fail('Soft-deleted unique values remain reserved.');
            } catch (QueryException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_enforce_rejects_missing_installation(): void
    {
        ['user' => $user, 'organization' => $organization, 'application' => $application] = $this->fixture();
        $application->delete();
        $this->expectException(HttpException::class);
        app(OrganizationAccess::class)->enforce($user, $organization->id, 'framework');
    }
}
