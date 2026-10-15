<?php

namespace App\Modules\Platform;

use App\Models\ApplicationEntitlementGrant;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MembershipActions
{
    public function listing(Request $request, User|PlatformUser $actor, int $organizationId): array
    {
        $input = $this->validated($request->all(), [
            'page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50',
            'status' => ['sometimes', Rule::in(array_keys(OrganizationMembership::options('status')))],
            'role' => ['sometimes', Rule::in(array_keys(OrganizationMembership::options()))],
        ]);
        $reader = $this->authorized($actor, $organizationId);
        $owner = $reader->role === OrganizationMembership::Owner;
        abort_if(! $owner && isset($input['status']) && $input['status'] !== OrganizationMembership::Active, 403);
        $query = OrganizationMembership::query()->where('organization_id', $organizationId);
        if (! $owner || isset($input['status'])) {
            $query->where('status', $owner ? $input['status'] : OrganizationMembership::Active);
        }
        if (isset($input['role'])) {
            $query->where('role', $input['role']);
        }
        $paginator = $query->with(['user:id,name', 'platformUser:id,name'])->orderBy('id')->paginate(
            (int) ($input['per_page'] ?? 20), ['id', 'user_id', 'platform_user_id', 'role', 'status', 'version'],
            'page', (int) ($input['page'] ?? 1));

        return ['data' => $paginator->getCollection()->map(fn (OrganizationMembership $member): array => $this->publicMembership($member))->all(),
            'meta' => [...$this->meta($paginator), 'organization_id' => $organizationId,
                'can_manage' => $owner, 'options' => $this->options()]];
    }

    public function detail(User|PlatformUser $actor, int $organizationId, int $membershipId): array
    {
        $reader = $this->authorized($actor, $organizationId, allowInvitedSelf: true);
        $member = $this->target($organizationId, $membershipId);
        abort_unless($this->mayRead($actor, $reader, $member), 404);

        return ['organization_id' => $organizationId, 'membership' => $this->publicMembership($member), 'options' => $this->options(),
            'can_manage' => $reader->status === OrganizationMembership::Active && $reader->role === OrganizationMembership::Owner];
    }

    public function invite(Request $request, User|PlatformUser $actor, int $organizationId): array
    {
        $column = $this->principalColumn($actor);
        $input = $this->validated($request->all(), [
            $column => 'required|integer:strict|min:1',
            'role' => ['required', Rule::in(array_keys(OrganizationMembership::options()))],
            'expected_version' => 'sometimes|integer:strict|min:0',
        ]);
        $this->authorized($actor, $organizationId, ownerOnly: true);
        $recipientQuery = $actor instanceof User ? User::query()->where('shop_id', $actor->shop_id) : PlatformUser::query();
        $recipient = $recipientQuery->whereKey($input[$column])->where('account_status', 'active')->first();
        if (! $recipient) {
            throw ValidationException::withMessages([$column => 'The selected user is unavailable.']);
        }
        $member = OrganizationMembership::query()->where('organization_id', $organizationId)
            ->where($column, $recipient->id)->lockForUpdate()->first();
        if ($member) {
            abort_unless($member->status === OrganizationMembership::Revoked, 409, 'The membership already exists.');
            $this->currentVersion($member, $input['expected_version'] ?? null);
            $member->update(['role' => $input['role'], 'status' => OrganizationMembership::Invited, 'version' => $member->version + 1]);
        } else {
            abort_if(isset($input['expected_version']), 409, 'The membership changed. Refresh before retrying.');
            try {
                $member = OrganizationMembership::create(['organization_id' => $organizationId,
                    $column => $recipient->id, 'role' => $input['role'], 'status' => OrganizationMembership::Invited]);
            } catch (QueryException $error) {
                if (in_array($error->getCode(), ['23505', '23000', '19'], true)) {
                    abort(409, 'The membership already exists.');
                }

                throw $error;
            }
        }
        $member->setRelation($actor instanceof User ? 'user' : 'platformUser', $recipient);

        return $this->detailPayload($member, true);
    }

    public function changeRole(Request $request, User|PlatformUser $actor, int $organizationId, int $membershipId): array
    {
        $input = $this->validated($request->all(), [
            'role' => ['required', Rule::in(array_keys(OrganizationMembership::options()))],
            'expected_version' => 'required|integer:strict|min:0',
        ]);
        $this->authorized($actor, $organizationId, ownerOnly: true);
        $member = $this->target($organizationId, $membershipId, true);
        abort_unless(in_array($member->status, [OrganizationMembership::Active, OrganizationMembership::Invited], true), 409);
        $this->currentVersion($member, $input['expected_version']);
        if ($member->role === OrganizationMembership::Owner && $member->status === OrganizationMembership::Active
            && $input['role'] !== OrganizationMembership::Owner) {
            $this->requireAnotherOwner($organizationId);
        }
        if ($member->role !== $input['role']) {
            $member->update(['role' => $input['role'], 'version' => $member->version + 1]);
        }

        return $this->detailPayload($member, true);
    }

    public function revoke(Request $request, User|PlatformUser $actor, int $organizationId, int $membershipId): array
    {
        $input = $this->validated($request->all(), ['expected_version' => 'required|integer:strict|min:0']);
        $this->authorized($actor, $organizationId, ownerOnly: true);
        $member = $this->target($organizationId, $membershipId, true);
        abort_unless(in_array($member->status, [OrganizationMembership::Active, OrganizationMembership::Invited], true), 409);
        $this->currentVersion($member, $input['expected_version']);
        if ($member->role === OrganizationMembership::Owner && $member->status === OrganizationMembership::Active) {
            $this->requireAnotherOwner($organizationId);
        }
        $member->update(['status' => OrganizationMembership::Revoked, 'version' => $member->version + 1]);

        return $this->detailPayload($member, true);
    }

    public function accept(Request $request, User|PlatformUser $actor, int $organizationId, int $membershipId): array
    {
        $input = $this->validated($request->all(), ['expected_version' => 'required|integer:strict|min:0']);
        $this->authorized($actor, $organizationId, allowInvitedSelf: true);
        $member = $this->target($organizationId, $membershipId, true);
        abort_unless($member->{$this->principalColumn($actor)} === $actor->id, 404);
        abort_unless($member->status === OrganizationMembership::Invited, 409);
        $this->currentVersion($member, $input['expected_version']);
        $member->update(['status' => OrganizationMembership::Active, 'version' => $member->version + 1]);

        return $this->detailPayload($member, false);
    }

    public function authorizeResult(User|PlatformUser $actor, string $action, array $payload, array $result): void
    {
        $organizationId = (int) ($payload['id'] ?? $result['organization_id'] ?? $result['meta']['organization_id'] ?? 0);
        $manager = in_array($action, ['platform.membership.invite', 'platform.membership.role', 'platform.membership.revoke'], true);
        $reader = $this->authorized($actor, $organizationId, ownerOnly: $manager,
            allowInvitedSelf: in_array($action, ['platform.membership', 'platform.membership.accept'], true));
        if ($action === 'platform.memberships') {
            $owner = $reader->role === OrganizationMembership::Owner;
            abort_if(! $owner && ($result['meta']['can_manage'] ?? false), 403);
            abort_if(! $owner && isset($payload['input']['status']) && $payload['input']['status'] !== OrganizationMembership::Active, 403);
            foreach ($result['data'] ?? [] as $row) {
                $member = $this->target($organizationId, (int) ($row['id'] ?? 0));
                abort_unless($owner || ($row['status'] ?? null) === OrganizationMembership::Active
                    && $member->status === OrganizationMembership::Active, 404);
            }

            return;
        }
        $membershipId = (int) ($payload['membership_id'] ?? $result['membership']['id'] ?? 0);
        $member = $this->target($organizationId, $membershipId);
        if ($action === 'platform.membership.accept') {
            abort_unless($member->{$this->principalColumn($actor)} === $actor->id
                && $member->status === OrganizationMembership::Active, 404);
        } elseif ($action === 'platform.membership') {
            abort_if($reader->role !== OrganizationMembership::Owner && ($result['can_manage'] ?? false), 403);
            abort_unless($this->mayRead($actor, $reader, $member), 404);
        }
    }

    private function authorized(User|PlatformUser $actor, int $organizationId, bool $ownerOnly = false, bool $allowInvitedSelf = false): OrganizationMembership
    {
        abort_unless(config('platform.applications.framework.available') === true, 403);
        $organization = Organization::query()->whereKey($organizationId)->lockForUpdate()->firstOrFail();
        $membership = OrganizationMembership::query()->where('organization_id', $organizationId)
            ->where($this->principalColumn($actor), $actor->id)->lockForUpdate()->first();
        abort_unless($membership && ($membership->status === OrganizationMembership::Active
            || $allowInvitedSelf && $membership->status === OrganizationMembership::Invited), 404);
        abort_unless($actor::query()->whereKey($actor->id)->where('account_status', 'active')->exists(), 403);
        abort_unless($organization->status === Organization::Active, 403);
        abort_unless(in_array($membership->role, array_keys(OrganizationMembership::options()), true), 403);
        $framework = OrganizationApplication::query()->where('organization_id', $organizationId)
            ->where('application_key', 'framework')->lockForUpdate()->first();
        abort_unless($framework?->state === OrganizationApplication::Installed, 403);
        abort_unless(ApplicationEntitlementGrant::activeFor($organizationId, 'framework')->exists(), 403);
        if ($ownerOnly) {
            abort_unless($membership->role === OrganizationMembership::Owner && $membership->status === OrganizationMembership::Active, 403);
        }

        return $membership;
    }

    private function target(int $organizationId, int $membershipId, bool $lock = false): OrganizationMembership
    {
        $query = OrganizationMembership::query()->where('organization_id', $organizationId)->with(['user:id,name', 'platformUser:id,name']);
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->findOrFail($membershipId);
    }

    private function mayRead(User|PlatformUser $actor, OrganizationMembership $reader, OrganizationMembership $member): bool
    {
        return $reader->status === OrganizationMembership::Active && $reader->role === OrganizationMembership::Owner
            || $reader->status === OrganizationMembership::Active && $member->status === OrganizationMembership::Active
            || $member->{$this->principalColumn($actor)} === $actor->id
                && in_array($member->status, [OrganizationMembership::Active, OrganizationMembership::Invited], true);
    }

    private function principalColumn(User|PlatformUser $actor): string
    {
        return $actor instanceof PlatformUser ? 'platform_user_id' : 'user_id';
    }

    private function currentVersion(OrganizationMembership $member, mixed $expected): void
    {
        abort_unless($expected !== null && $member->version === (int) $expected, 409, 'The membership changed. Refresh before retrying.');
    }

    private function requireAnotherOwner(int $organizationId): void
    {
        abort_unless(OrganizationMembership::query()->where('organization_id', $organizationId)
            ->where('role', OrganizationMembership::Owner)->where('status', OrganizationMembership::Active)->count() > 1,
            409, 'The last active owner cannot lose access.');
    }

    private function publicMembership(OrganizationMembership $member): array
    {
        $principal = $member->platform_user_id ? $member->platformUser : $member->user;

        return ['id' => $member->id, 'role' => $member->role, 'status' => $member->status,
            'version' => $member->version, 'user' => $principal ? [
                'id' => $principal->id, 'name' => $principal->name,
                'kind' => $member->platform_user_id ? 'platform' : 'shop',
            ] : null];
    }

    private function detailPayload(OrganizationMembership $member, bool $canManage): array
    {
        return ['organization_id' => $member->organization_id, 'membership' => $this->publicMembership($member),
            'options' => $this->options(), 'can_manage' => $canManage];
    }

    private function options(): array
    {
        return ['role' => OrganizationMembership::options(), 'status' => OrganizationMembership::options('status')];
    }

    private function meta(LengthAwarePaginator $paginator): array
    {
        return ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(),
            'total' => $paginator->total(), 'per_page' => $paginator->perPage()];
    }

    private function validated(array $input, array $rules): array
    {
        foreach (array_diff(array_keys($input), array_keys($rules)) as $field) {
            throw ValidationException::withMessages([$field => 'The field is not supported.']);
        }
        foreach (['page', 'per_page'] as $field) {
            if (isset($input[$field]) && is_string($input[$field]) && preg_match('/^[1-9][0-9]*$/D', $input[$field])) {
                $input[$field] = (int) $input[$field];
            }
        }

        return Validator::make($input, $rules)->validate();
    }
}
