<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\Shop;
use App\Models\User;
use App\Modules\Platform\OrganizationAccess;
use App\Modules\Platform\OrganizationActions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class OrganizationPlatformIdentityTest extends TestCase
{
    use RefreshDatabase;

    public function test_platform_identity_creates_and_manages_its_own_organization(): void
    {
        config(['platform.applications.framework.available' => true]);
        $platformUser = PlatformUser::factory()->create();
        $actions = app(OrganizationActions::class);
        $created = $actions->create($this->request(['code' => 'standalone', 'name' => 'Standalone']), $platformUser);
        $id = $created['organization']['id'];

        $this->assertDatabaseHas('organization_memberships', ['organization_id' => $id, 'user_id' => null,
            'platform_user_id' => $platformUser->id, 'role' => OrganizationMembership::Owner, 'status' => OrganizationMembership::Active]);
        $this->assertSame(1, $actions->listing($this->request([]), $platformUser)['meta']['total']);
        $this->assertTrue($actions->detail($platformUser, $id)['can_update']);
        $this->assertSame(['framework'], array_column($actions->applications($this->request([]), $platformUser, $id)['data'], 'application_key'));
        $updated = $actions->update($this->request(['name' => 'Renamed', 'expected_version' => 0]), $platformUser, $id);
        $this->assertSame('Renamed', $updated['organization']['name']);
        $actions->authorizeResult($platformUser, 'platform.organization.update', ['id' => $id], $updated);
    }

    public function test_matching_numeric_ids_never_cross_between_platform_and_shop_memberships(): void
    {
        config(['platform.applications.framework.available' => true]);
        $platformUser = PlatformUser::factory()->create();
        $shop = Shop::create(['slug' => 'identity-shop', 'name' => 'Identity Shop']);
        $shopUser = User::factory()->create(['id' => $platformUser->id, 'shop_id' => $shop->id]);
        $this->assertSame($platformUser->id, $shopUser->id);
        $actions = app(OrganizationActions::class);
        $access = app(OrganizationAccess::class);
        $platformOrganization = $actions->create($this->request(['code' => 'platform-org', 'name' => 'Platform']), $platformUser)['organization']['id'];
        $shopOrganization = $actions->create($this->request(['code' => 'shop-org', 'name' => 'Shop']), $shopUser)['organization']['id'];

        $this->assertTrue($access->allows($platformUser, $platformOrganization, 'framework', OrganizationMembership::Owner));
        $this->assertTrue($access->allows($shopUser, $shopOrganization, 'framework', OrganizationMembership::Owner));
        $this->assertFalse($access->allows($platformUser, $shopOrganization, 'framework'));
        $this->assertFalse($access->allows($shopUser, $platformOrganization, 'framework'));
        $this->assertSame(1, $access->grantedApplications($platformUser, $platformOrganization)->total());
        $this->assertSame(0, $access->grantedApplications($platformUser, $shopOrganization)->total());
        $this->assertSame([$platformOrganization], array_column($actions->listing($this->request([]), $platformUser)['data'], 'id'));
        $this->assertSame([$shopOrganization], array_column($actions->listing($this->request([]), $shopUser)['data'], 'id'));
        $this->assertDenied(fn () => $actions->detail($platformUser, $shopOrganization), 404);
        $this->assertDenied(fn () => $actions->detail($shopUser, $platformOrganization), 404);
    }

    public function test_revoked_membership_and_disabled_platform_account_remove_access(): void
    {
        config(['platform.applications.framework.available' => true]);
        $user = PlatformUser::factory()->create();
        $actions = app(OrganizationActions::class);
        $access = app(OrganizationAccess::class);
        $created = $actions->create($this->request(['code' => 'revocable', 'name' => 'Revocable']), $user);
        $id = $created['organization']['id'];
        OrganizationMembership::where('organization_id', $id)->update(['status' => OrganizationMembership::Revoked]);
        $this->assertFalse($access->allows($user, $id, 'framework'));
        $this->assertDenied(fn () => $actions->detail($user, $id), 404);
        $this->assertSame(0, $actions->listing($this->request([]), $user)['meta']['total']);
        OrganizationMembership::where('organization_id', $id)->update(['status' => OrganizationMembership::Active]);
        OrganizationApplication::where('organization_id', $id)->update(['state' => OrganizationApplication::Disabled]);
        $this->assertFalse($access->allows($user, $id, 'framework'));
        $this->assertDenied(fn () => $actions->detail($user, $id), 403);
        OrganizationApplication::where('organization_id', $id)->update(['state' => OrganizationApplication::Installed]);
        $user->update(['account_status' => PlatformUser::Disabled]);
        $this->assertFalse($access->allows($user, $id, 'framework'));
        $this->assertDenied(fn () => $actions->detail($user, $id), 403);
        $this->assertDenied(fn () => $actions->listing($this->request([]), $user), 403);
        $this->assertDenied(fn () => $actions->authorizeResult($user, 'platform.organization', ['id' => $id], $created), 403);
        $this->assertSame(1, Organization::count());
        $user->update(['account_status' => PlatformUser::Active]);
        $user->delete();
        $this->assertFalse($access->allows($user, $id, 'framework'));
    }

    private function assertDenied(callable $action, int $status): void
    {
        try {
            $action();
            $this->fail('Access must be denied.');
        } catch (HttpException $error) {
            $this->assertSame($status, $error->getStatusCode());
        }
    }

    private function request(array $input): Request
    {
        return Request::create('/', 'POST', $input);
    }
}
