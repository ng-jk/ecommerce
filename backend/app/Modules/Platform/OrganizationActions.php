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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class OrganizationActions
{
    public function listing(Request $request, User|PlatformUser $user): array
    {
        abort_unless($this->frameworkAvailable(), 403, 'Framework access is unavailable.');
        $this->enforceCurrentPrincipal($user);
        $input = $this->validated($request->all(), [
            'page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50',
            'status' => ['sometimes', Rule::in(array_keys(Organization::options()))],
        ]);
        $query = Organization::query()
            ->join('organization_memberships as memberships', 'memberships.organization_id', '=', 'organizations.id')
            ->join('organization_applications as framework', 'framework.organization_id', '=', 'organizations.id')
            ->where('memberships.'.$this->principalColumn($user), $user->id)
            ->whereNull('memberships.'.$this->otherPrincipalColumn($user))
            ->where('memberships.status', OrganizationMembership::Active)
            ->whereIn('memberships.role', [OrganizationMembership::Member, OrganizationMembership::Admin, OrganizationMembership::Owner])
            ->whereNull('memberships.deleted_at')
            ->where('framework.application_key', 'framework')
            ->where('framework.state', OrganizationApplication::Installed)
            ->whereNull('framework.deleted_at')
            ->whereExists(function ($query): void {
                $query->selectRaw('1')->from('application_entitlement_grants as grants')
                    ->whereColumn('grants.organization_id', 'organizations.id')
                    ->where('grants.application_key', 'framework')
                    ->where('grants.starts_at', '<=', now())
                    ->where(fn ($query) => $query->whereNull('grants.expires_at')->orWhere('grants.expires_at', '>', now()))
                    ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('application_entitlement_revocations as revocations')
                        ->whereColumn('revocations.grant_id', 'grants.id'));
            })
            ->where('organizations.status', Organization::Active);
        if (isset($input['status'])) {
            $query->where('organizations.status', $input['status']);
        }
        $paginator = $query->orderBy('organizations.id')->paginate((int) ($input['per_page'] ?? 20),
            ['organizations.id', 'organizations.code', 'organizations.name', 'organizations.status', 'organizations.version'],
            'page', (int) ($input['page'] ?? 1));

        return ['data' => $paginator->getCollection()->map(fn (Organization $organization): array => $this->publicOrganization($organization))->all(),
            'meta' => [...$this->meta($paginator), 'options' => ['status' => Organization::options()]]];
    }

    public function create(Request $request, User|PlatformUser $user): array
    {
        abort_unless($this->frameworkAvailable(), 403, 'Framework access is unavailable.');
        $this->enforceCurrentPrincipal($user);
        $input = $this->validated($request->all(), [
            'code' => ['required', 'string', 'min:3', 'max:80', 'regex:/^[a-z][a-z0-9-]*$/', Rule::unique('organizations', 'code')],
            'name' => 'required|string|min:1|max:200',
        ]);
        try {
            $organization = DB::transaction(function () use ($input, $user): Organization {
                $organization = Organization::create(['code' => $input['code'], 'name' => trim($input['name'])]);
                OrganizationMembership::create(['organization_id' => $organization->id, $this->principalColumn($user) => $user->id,
                    'role' => OrganizationMembership::Owner, 'status' => OrganizationMembership::Active]);
                OrganizationApplication::create(['organization_id' => $organization->id, 'application_key' => 'framework',
                    'state' => OrganizationApplication::Installed]);
                ApplicationEntitlementGrant::create(['organization_id' => $organization->id, 'application_key' => 'framework',
                    'source' => ApplicationEntitlementGrant::Free, 'evidence_ref' => 'framework-create:'.$organization->id,
                    'starts_at' => now(), 'evidence' => ['kind' => 'organization_creation']]);

                return $organization;
            });
        } catch (QueryException $error) {
            if (in_array($error->getCode(), ['23505', '23000', '19'], true)) {
                throw ValidationException::withMessages(['code' => 'The code has already been taken.']);
            }

            throw $error;
        }

        return ['organization' => $this->publicOrganization($organization), 'options' => ['status' => Organization::options()], 'can_update' => true];
    }

    public function detail(User|PlatformUser $user, int $id): array
    {
        [$organization, $membership] = $this->authorized($user, $id);

        return ['organization' => $this->publicOrganization($organization), 'options' => ['status' => Organization::options()],
            'can_update' => $membership->role === OrganizationMembership::Owner];
    }

    public function update(Request $request, User|PlatformUser $user, int $id): array
    {
        $input = $this->validated($request->all(), [
            'name' => 'required|string|min:1|max:200',
            'expected_version' => 'required|integer:strict|min:0',
        ]);
        [$organization, $membership] = $this->authorized($user, $id);
        abort_unless($membership->role === OrganizationMembership::Owner, 403, 'Organization owner access is required.');
        abort_unless($organization->version === (int) $input['expected_version'], 409, 'The organization changed. Refresh before retrying.');
        $organization->update(['name' => trim($input['name']), 'version' => $organization->version + 1]);

        return ['organization' => $this->publicOrganization($organization), 'options' => ['status' => Organization::options()], 'can_update' => true];
    }

    public function applications(Request $request, User|PlatformUser $user, int $id): array
    {
        $input = $this->validated($request->all(), [
            'page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50',
        ]);
        $this->authorized($user, $id);
        $configured = config('platform.applications', []);
        $keys = $this->frameworkAvailable() && ApplicationEntitlementGrant::activeFor($id, 'framework')->exists() ? ['framework'] : [];
        $paginator = OrganizationApplication::query()->where('organization_id', $id)
            ->where('state', OrganizationApplication::Installed)->whereIn('application_key', $keys)
            ->orderBy('id')->paginate((int) ($input['per_page'] ?? 20), ['id', 'application_key', 'state'], 'page', (int) ($input['page'] ?? 1));
        $data = $paginator->getCollection()->map(function (OrganizationApplication $application) use ($configured): array {
            $descriptor = $configured[$application->application_key];

            return ['id' => $application->id, 'application_key' => $application->application_key,
                'name' => $descriptor['name'], 'state' => $application->state, 'contract_version' => $descriptor['contract_version']];
        })->all();

        return ['data' => $data, 'meta' => [...$this->meta($paginator), 'organization_id' => $id,
            'options' => ['state' => OrganizationApplication::options()]]];
    }

    private function authorized(User|PlatformUser $user, int $id): array
    {
        abort_unless($this->frameworkAvailable(), 403, 'Framework access is unavailable.');
        $this->enforceCurrentPrincipal($user);
        $organization = Organization::query()->whereKey($id)->lockForUpdate()->firstOrFail();
        $membership = OrganizationMembership::query()->where('organization_id', $id)
            ->where($this->principalColumn($user), $user->id)
            ->whereNull($this->otherPrincipalColumn($user))
            ->lockForUpdate()->first();
        abort_unless($membership?->status === OrganizationMembership::Active, 404);
        abort_unless($organization->status === Organization::Active, 403, 'Organization access is unavailable.');
        abort_unless(in_array($membership->role, [OrganizationMembership::Member, OrganizationMembership::Admin, OrganizationMembership::Owner], true), 403);
        $framework = OrganizationApplication::query()->where('organization_id', $id)->where('application_key', 'framework')
            ->lockForUpdate()->first();
        abort_unless($framework?->state === OrganizationApplication::Installed, 403, 'Framework access is unavailable.');
        abort_unless(ApplicationEntitlementGrant::activeFor($id, 'framework')->exists(), 403, 'Framework entitlement is unavailable.');

        return [$organization, $membership];
    }

    public function authorizeResult(User|PlatformUser $user, string $action, array $payload, array $result): void
    {
        $this->enforceCurrentPrincipal($user);
        if ($action === 'platform.organizations') {
            foreach ($result['data'] ?? [] as $organization) {
                $this->authorized($user, (int) $organization['id']);
            }

            return;
        }
        $id = (int) ($payload['id'] ?? $result['organization']['id'] ?? $result['meta']['organization_id'] ?? 0);
        [, $membership] = $this->authorized($user, $id);
        if ($action === 'platform.organization.update') {
            abort_unless($membership->role === OrganizationMembership::Owner, 403);
        }
    }

    private function principalColumn(User|PlatformUser $user): string
    {
        return $user instanceof PlatformUser ? 'platform_user_id' : 'user_id';
    }

    private function otherPrincipalColumn(User|PlatformUser $user): string
    {
        return $user instanceof PlatformUser ? 'user_id' : 'platform_user_id';
    }

    private function enforceCurrentPrincipal(User|PlatformUser $user): void
    {
        abort_unless($user->getKey() !== null && $user::query()->whereKey($user->getKey())
            ->where('account_status', 'active')->exists(), 403);
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

    private function frameworkAvailable(): bool
    {
        $descriptor = config('platform.applications.framework');

        return is_array($descriptor) && ($descriptor['available'] ?? false) === true
            && is_string($descriptor['name'] ?? null) && $descriptor['name'] !== ''
            && is_string($descriptor['contract_version'] ?? null) && $descriptor['contract_version'] !== '';
    }

    private function publicOrganization(Organization $organization): array
    {
        return ['id' => $organization->id, 'code' => $organization->code, 'name' => $organization->name,
            'status' => $organization->status, 'version' => $organization->version];
    }

    private function meta(LengthAwarePaginator $paginator): array
    {
        return ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(),
            'total' => $paginator->total(), 'per_page' => $paginator->perPage()];
    }
}
