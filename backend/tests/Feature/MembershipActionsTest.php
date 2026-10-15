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
use App\Modules\Platform\MembershipActions;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PDOException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class MembershipActionsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Organization $organization;

    private OrganizationMembership $ownerMembership;

    protected function setUp(): void
    {
        parent::setUp();
        config(['platform.applications.framework.available' => true]);
        $shop = Shop::create(['slug' => 'members', 'name' => 'Members']);
        $this->owner = User::factory()->create(['shop_id' => $shop->id]);
        $this->organization = Organization::factory()->create();
        $this->ownerMembership = OrganizationMembership::factory()->create([
            'organization_id' => $this->organization->id, 'user_id' => $this->owner->id,
            'role' => OrganizationMembership::Owner, 'status' => OrganizationMembership::Active,
        ]);
        OrganizationApplication::factory()->create(['organization_id' => $this->organization->id,
            'application_key' => 'framework', 'state' => OrganizationApplication::Installed]);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $this->organization->id,
            'application_key' => 'framework', 'source' => ApplicationEntitlementGrant::Free]);
    }

    private function actions(): MembershipActions
    {
        return app(MembershipActions::class);
    }

    private function request(array $input): Request
    {
        return Request::create('/', 'POST', $input);
    }

    private function recipient(): User
    {
        return User::factory()->create(['shop_id' => $this->owner->shop_id]);
    }

    private function invite(User $recipient, string $role = OrganizationMembership::Member): OrganizationMembership
    {
        $result = DB::transaction(fn (): array => $this->actions()->invite($this->request([
            'user_id' => $recipient->id, 'role' => $role,
        ]), $this->owner, $this->organization->id));

        return OrganizationMembership::findOrFail($result['membership']['id']);
    }

    private function assertHttp(int $status, callable $action): void
    {
        try {
            $action();
            $this->fail('Expected HTTP '.$status);
        } catch (HttpException $error) {
            $this->assertSame($status, $error->getStatusCode());
        }
    }

    public function test_framework_grant_is_required_for_commands_and_completed_receipts(): void
    {
        $result = $this->actions()->listing($this->request([]), $this->owner, $this->organization->id);
        $grant = ApplicationEntitlementGrant::activeFor($this->organization->id, 'framework')->firstOrFail();
        ApplicationEntitlementRevocation::factory()->create(['grant_id' => $grant->id]);
        $this->assertHttp(403, fn () => $this->actions()->listing($this->request([]), $this->owner, $this->organization->id));
        $this->assertHttp(403, fn () => $this->actions()->authorizeResult($this->owner, 'platform.memberships',
            ['id' => $this->organization->id, 'input' => []], $result));
    }

    public function test_invite_accept_and_read_are_scoped_and_public(): void
    {
        $recipient = $this->recipient();
        $member = $this->invite($recipient);
        $this->assertSame(OrganizationMembership::Invited, $member->status);
        $this->assertSame(0, $member->version);
        $this->assertSame('invited', $this->actions()->detail($recipient, $this->organization->id, $member->id)['membership']['status']);
        $this->assertHttp(404, fn () => $this->actions()->detail($recipient, $this->organization->id, $this->ownerMembership->id));
        $this->assertHttp(404, fn () => $this->actions()->listing($this->request([]), $recipient, $this->organization->id));
        $this->assertHttp(404, fn () => $this->actions()->accept($this->request(['expected_version' => 0]), $this->owner, $this->organization->id, $member->id));
        $accepted = DB::transaction(fn (): array => $this->actions()->accept($this->request(['expected_version' => 0]), $recipient, $this->organization->id, $member->id));
        $this->assertSame(1, $accepted['membership']['version']);
        $this->assertSame('active', $accepted['membership']['status']);
        $this->assertArrayNotHasKey('email', $accepted['membership']['user']);
        $this->assertArrayNotHasKey('user_id', $accepted['membership']);
        $page = $this->actions()->listing($this->request(['page' => '2', 'per_page' => '1', 'role' => 'member']), $this->owner, $this->organization->id);
        $this->assertSame(1, $page['meta']['total']);
        $this->assertCount(0, $page['data']);
        $directory = $this->actions()->listing($this->request(['status' => 'active']), $recipient, $this->organization->id);
        $this->assertSame(2, $directory['meta']['total']);
        $this->assertSame('owner', $this->actions()->detail($recipient, $this->organization->id, $this->ownerMembership->id)['membership']['role']);
        $this->assertHttp(403, fn () => $this->actions()->listing($this->request(['status' => 'invited']), $recipient, $this->organization->id));
    }

    public function test_versioned_role_revocation_and_reinvite(): void
    {
        $recipient = $this->recipient();
        $member = $this->invite($recipient);
        $changed = $this->actions()->changeRole($this->request(['role' => 'admin', 'expected_version' => 0]),
            $this->owner, $this->organization->id, $member->id);
        $this->assertSame(1, $changed['membership']['version']);
        $this->assertSame('admin', $changed['membership']['role']);
        $this->assertHttp(409, fn () => $this->actions()->accept($this->request(['expected_version' => 0]), $recipient, $this->organization->id, $member->id));
        $revoked = $this->actions()->revoke($this->request(['expected_version' => 1]), $this->owner, $this->organization->id, $member->id);
        $this->assertSame('revoked', $revoked['membership']['status']);
        $this->assertSame(2, $revoked['membership']['version']);
        $this->assertHttp(409, fn () => $this->actions()->revoke($this->request(['expected_version' => 2]), $this->owner, $this->organization->id, $member->id));
        $this->assertHttp(409, fn () => $this->actions()->invite($this->request(['user_id' => $recipient->id,
            'role' => 'member', 'expected_version' => 1]), $this->owner, $this->organization->id));
        $reinvite = $this->actions()->invite($this->request(['user_id' => $recipient->id,
            'role' => 'member', 'expected_version' => 2]), $this->owner, $this->organization->id);
        $this->assertSame($member->id, $reinvite['membership']['id']);
        $this->assertSame(3, $reinvite['membership']['version']);
    }

    public function test_last_active_owner_cannot_lose_access(): void
    {
        $this->assertHttp(409, fn () => $this->actions()->changeRole($this->request(['role' => 'member', 'expected_version' => 0]),
            $this->owner, $this->organization->id, $this->ownerMembership->id));
        $this->assertHttp(409, fn () => $this->actions()->revoke($this->request(['expected_version' => 0]),
            $this->owner, $this->organization->id, $this->ownerMembership->id));
        $recipient = $this->recipient();
        $member = $this->invite($recipient, OrganizationMembership::Owner);
        $this->assertHttp(409, fn () => $this->actions()->revoke($this->request(['expected_version' => 0]),
            $this->owner, $this->organization->id, $this->ownerMembership->id));
        $this->actions()->accept($this->request(['expected_version' => 0]), $recipient, $this->organization->id, $member->id);
        $this->actions()->revoke($this->request(['expected_version' => 0]), $this->owner, $this->organization->id, $this->ownerMembership->id);
        $this->assertHttp(404, fn () => $this->actions()->invite($this->request(['user_id' => $this->recipient()->id, 'role' => 'member']),
            $this->owner, $this->organization->id));
    }

    public function test_invitation_rejects_cross_shop_unknown_and_email_lookup_equally(): void
    {
        $otherShop = Shop::create(['slug' => 'another-members', 'name' => 'Other']);
        $outsider = User::factory()->create(['shop_id' => $otherShop->id]);
        foreach ([$outsider->id, 999999] as $userId) {
            try {
                $this->actions()->invite($this->request(['user_id' => $userId, 'role' => 'member']), $this->owner, $this->organization->id);
                $this->fail('The user must be unavailable.');
            } catch (ValidationException $error) {
                $this->assertSame(['The selected user is unavailable.'], $error->errors()['user_id']);
            }
        }
        $this->assertDatabaseMissing('organization_memberships', ['organization_id' => $this->organization->id, 'user_id' => $outsider->id]);
        $this->assertHttp(409, fn () => $this->actions()->invite($this->request(['user_id' => $this->owner->id, 'role' => 'owner']),
            $this->owner, $this->organization->id));
        try {
            $this->actions()->invite($this->request(['email' => $outsider->email, 'role' => 'member']), $this->owner, $this->organization->id);
            $this->fail('Email lookup must not be accepted.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('email', $error->errors());
        }
    }

    public function test_result_authorization_rechecks_owner_and_visibility(): void
    {
        $recipient = $this->recipient();
        $member = $this->invite($recipient);
        $listed = $this->actions()->listing($this->request([]), $this->owner, $this->organization->id);
        $this->actions()->authorizeResult($this->owner, 'platform.memberships', ['id' => $this->organization->id], $listed);
        $this->actions()->authorizeResult($this->owner, 'platform.membership.invite', ['id' => $this->organization->id], ['membership' => ['id' => $member->id]]);
        $this->ownerMembership->update(['role' => OrganizationMembership::Member]);
        $this->assertHttp(403, fn () => $this->actions()->authorizeResult($this->owner, 'platform.memberships',
            ['id' => $this->organization->id], $listed));
        $this->assertHttp(403, fn () => $this->actions()->authorizeResult($this->owner, 'platform.membership',
            ['id' => $this->organization->id, 'membership_id' => $this->ownerMembership->id],
            ['can_manage' => true]));
        $this->assertHttp(403, fn () => $this->actions()->authorizeResult($this->owner, 'platform.membership.invite',
            ['id' => $this->organization->id], ['membership' => ['id' => $member->id]]));
        $this->ownerMembership->update(['role' => OrganizationMembership::Owner]);
        $member->update(['status' => OrganizationMembership::Revoked]);
        $this->assertHttp(404, fn () => $this->actions()->authorizeResult($recipient, 'platform.membership',
            ['id' => $this->organization->id, 'membership_id' => $member->id], []));
    }

    public function test_platform_owner_invites_only_existing_platform_principals(): void
    {
        $platformOwner = PlatformUser::factory()->create();
        $platformRecipient = PlatformUser::factory()->create();
        $platformOwnerMembership = OrganizationMembership::factory()->create([
            'organization_id' => $this->organization->id, 'user_id' => null,
            'platform_user_id' => $platformOwner->id, 'role' => OrganizationMembership::Owner,
            'status' => OrganizationMembership::Active,
        ]);
        $this->ownerMembership->update(['role' => OrganizationMembership::Member]);
        $invited = $this->actions()->invite($this->request([
            'platform_user_id' => $platformRecipient->id, 'role' => 'admin',
        ]), $platformOwner, $this->organization->id);
        $this->assertSame('platform', $invited['membership']['user']['kind']);
        $this->assertSame($platformRecipient->id, $invited['membership']['user']['id']);
        $this->assertDatabaseHas('organization_memberships', ['id' => $invited['membership']['id'],
            'user_id' => null, 'platform_user_id' => $platformRecipient->id]);
        $this->assertSame('invited', $this->actions()->detail($platformRecipient, $this->organization->id,
            $invited['membership']['id'])['membership']['status']);
        $this->actions()->accept($this->request(['expected_version' => 0]), $platformRecipient, $this->organization->id,
            $invited['membership']['id']);
        $this->actions()->authorizeResult($platformRecipient, 'platform.membership.accept',
            ['id' => $this->organization->id, 'membership_id' => $invited['membership']['id']], []);
        try {
            $this->actions()->detail($platformRecipient, $this->organization->id, $platformOwnerMembership->id + 999999);
            $this->fail('Missing membership must not be readable.');
        } catch (ModelNotFoundException) {
            $this->assertTrue(true);
        }
        try {
            $this->actions()->invite($this->request(['user_id' => $this->owner->id, 'role' => 'member']),
                $platformOwner, $this->organization->id);
            $this->fail('Platform identity cannot implicitly link to shop identity.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('user_id', $error->errors());
        }
        $this->assertHttp(403, fn () => $this->actions()->invite($this->request([
            'user_id' => $this->owner->id, 'role' => 'owner',
        ]), $this->owner, $this->organization->id));
    }

    public function test_current_authority_and_bad_inputs_fail_closed(): void
    {
        $recipient = $this->recipient();
        $member = $this->invite($recipient);
        $this->assertHttp(409, fn () => $this->actions()->invite($this->request([
            'user_id' => $recipient->id, 'role' => 'member',
        ]), $this->owner, $this->organization->id));
        $this->assertHttp(409, fn () => $this->actions()->accept($this->request(['expected_version' => 1]),
            $recipient, $this->organization->id, $member->id));
        $this->assertHttp(409, fn () => $this->actions()->invite($this->request([
            'user_id' => $this->recipient()->id, 'role' => 'member', 'expected_version' => 0,
        ]), $this->owner, $this->organization->id));
        foreach ([['page' => '0'], ['per_page' => '51'], ['role' => 'superowner'], ['status' => 'unknown']] as $input) {
            try {
                $this->actions()->listing($this->request($input), $this->owner, $this->organization->id);
                $this->fail('Invalid listing input must fail.');
            } catch (ValidationException $error) {
                $this->assertNotEmpty($error->errors());
            }
        }
        DB::table('users')->where('id', $this->owner->id)->update(['account_status' => 'disabled']);
        $this->assertHttp(403, fn () => $this->actions()->listing($this->request([]), $this->owner, $this->organization->id));
        DB::table('users')->where('id', $this->owner->id)->update(['account_status' => 'active']);
        $this->organization->update(['status' => Organization::Suspended]);
        $this->assertHttp(403, fn () => $this->actions()->detail($this->owner, $this->organization->id, $member->id));
        $this->organization->update(['status' => Organization::Active]);
        OrganizationApplication::where('organization_id', $this->organization->id)->update(['state' => OrganizationApplication::Disabled]);
        $this->assertHttp(403, fn () => $this->actions()->listing($this->request([]), $this->owner, $this->organization->id));
    }

    public function test_invite_maps_unique_race_and_preserves_storage_failure(): void
    {
        $raced = $this->recipient();
        $broken = $this->recipient();
        OrganizationMembership::creating(function (OrganizationMembership $member) use ($raced, $broken): void {
            if ($member->user_id === $raced->id) {
                DB::table('organization_memberships')->insert([
                    'organization_id' => $member->organization_id, 'user_id' => $raced->id,
                    'role' => 'member', 'status' => 'invited', 'version' => 0,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            if ($member->user_id === $broken->id) {
                throw new QueryException('sqlite', 'insert into organization_memberships', [],
                    new PDOException('Storage failure', 1));
            }
        });
        $this->assertHttp(409, fn () => DB::transaction(fn (): array => $this->actions()->invite($this->request([
            'user_id' => $raced->id, 'role' => 'member',
        ]), $this->owner, $this->organization->id)));
        try {
            $this->actions()->invite($this->request(['user_id' => $broken->id, 'role' => 'member']),
                $this->owner, $this->organization->id);
            $this->fail('Storage failure must remain retryable.');
        } catch (QueryException $error) {
            $this->assertSame('1', (string) $error->getCode());
        }
    }

    public function test_detail_receipt_rechecks_current_self_visibility(): void
    {
        $recipient = $this->recipient();
        $member = $this->invite($recipient);
        $this->actions()->authorizeResult($recipient, 'platform.membership',
            ['id' => $this->organization->id, 'membership_id' => $member->id], []);
        $member->update(['status' => OrganizationMembership::Active]);
        $this->actions()->authorizeResult($recipient, 'platform.membership',
            ['id' => $this->organization->id, 'membership_id' => $member->id], []);
        $member->update(['status' => OrganizationMembership::Revoked]);
        $this->assertHttp(404, fn () => $this->actions()->authorizeResult($this->owner, 'platform.membership.accept',
            ['id' => $this->organization->id, 'membership_id' => $member->id], []));
    }
}
