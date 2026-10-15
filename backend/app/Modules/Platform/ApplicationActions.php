<?php

namespace App\Modules\Platform;

use App\Models\ApplicationDefinition;
use App\Models\ApplicationEntitlementGrant;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class ApplicationActions
{
    public function catalog(Request $request, User|PlatformUser $actor, int $organizationId): array
    {
        $input = $this->catalogInput($request);
        $membership = $this->authorized($actor, $organizationId);
        $query = ApplicationDefinition::query();
        if (isset($input['application_key'])) {
            $query->where('application_key', $input['application_key']);
        }
        $paginator = $query->orderBy('id')->paginate((int) ($input['per_page'] ?? 20),
            ['id', 'application_key', 'name', 'service', 'contract_version'], 'page', (int) ($input['page'] ?? 1));
        $keys = $paginator->getCollection()->pluck('application_key')->all();
        $installed = OrganizationApplication::query()->where('organization_id', $organizationId)
            ->whereIn('application_key', $keys)->get()->keyBy('application_key');
        $granted = ApplicationEntitlementGrant::query()->where('organization_id', $organizationId)
            ->whereIn('application_key', $keys)->activeAt()->pluck('application_key')->all();
        $data = $paginator->getCollection()->map(function (ApplicationDefinition $definition) use ($installed, $granted): array {
            $key = $definition->application_key;
            $installation = $installed->get($key);

            return ['application_key' => $key, 'name' => $definition->name,
                'contract_version' => $definition->contract_version,
                'available' => $this->installable($key, config('platform.applications.'.$key)),
                'entitled' => in_array($key, $granted, true),
                'state' => $installation?->state, 'version' => $installation?->version];
        })->all();

        return ['data' => $data, 'meta' => ['organization_id' => $organizationId,
            'current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(),
            'total' => $paginator->total(), 'per_page' => $paginator->perPage(),
            'can_manage' => $membership->role === OrganizationMembership::Owner,
            'options' => ['state' => OrganizationApplication::options()]]];
    }

    public function install(Request $request, User|PlatformUser $actor, int $organizationId, string $applicationKey): array
    {
        $input = $this->validated($request);

        return DB::transaction(function () use ($actor, $organizationId, $applicationKey, $input): array {
            $this->authorized($actor, $organizationId, true);
            $this->requireInstallable($applicationKey);
            $this->requireEntitlement($organizationId, $applicationKey);
            $existing = OrganizationApplication::query()->where('organization_id', $organizationId)
                ->where('application_key', $applicationKey)->lockForUpdate()->first();
            abort_unless($existing === null && $input['expected_version'] === 0, 409, 'The installation changed. Refresh before retrying.');
            try {
                $installation = OrganizationApplication::create(['organization_id' => $organizationId,
                    'application_key' => $applicationKey, 'state' => OrganizationApplication::Installed]);
            } catch (QueryException $error) {
                if (in_array($error->getCode(), ['23505', '23000', '19'], true)) {
                    abort(409, 'The installation already exists.');
                }

                throw $error;
            }

            return $this->result($organizationId, $installation);
        });
    }

    public function disable(Request $request, User|PlatformUser $actor, int $organizationId, string $applicationKey): array
    {
        return $this->transition($request, $actor, $organizationId, $applicationKey,
            OrganizationApplication::Installed, OrganizationApplication::Disabled);
    }

    public function reenable(Request $request, User|PlatformUser $actor, int $organizationId, string $applicationKey): array
    {
        return $this->transition($request, $actor, $organizationId, $applicationKey,
            OrganizationApplication::Disabled, OrganizationApplication::Installed);
    }

    public function authorizeResult(User|PlatformUser $actor, string $action, array $payload, array $result): void
    {
        $organizationId = (int) ($payload['id'] ?? $result['meta']['organization_id'] ?? $result['organization_id'] ?? 0);
        abort_unless((int) ($result['meta']['organization_id'] ?? $result['organization_id'] ?? 0) === $organizationId, 403);
        $this->authorized($actor, $organizationId, $action !== 'platform.application.catalog');
        if (in_array($action, ['platform.application.install', 'platform.application.reenable'], true)) {
            $key = (string) ($payload['application_key'] ?? $result['application']['application_key'] ?? '');
            $this->requireInstallable($key);
            $this->requireEntitlement($organizationId, $key);
            abort_unless(OrganizationApplication::query()->where('organization_id', $organizationId)
                ->where('application_key', $key)->where('state', OrganizationApplication::Installed)->exists(), 403);
        }
    }

    private function transition(Request $request, User|PlatformUser $actor, int $organizationId,
        string $applicationKey, string $from, string $to): array
    {
        $input = $this->validated($request);

        return DB::transaction(function () use ($actor, $organizationId, $applicationKey, $from, $to, $input): array {
            $this->authorized($actor, $organizationId, true);
            abort_if($applicationKey === 'framework', 403, 'Framework cannot be disabled.');
            if ($to === OrganizationApplication::Installed) {
                $this->requireInstallable($applicationKey);
                $this->requireEntitlement($organizationId, $applicationKey);
            }
            $installation = OrganizationApplication::query()->where('organization_id', $organizationId)
                ->where('application_key', $applicationKey)->lockForUpdate()->firstOrFail();
            abort_unless($installation->state === $from && $installation->version === $input['expected_version'],
                409, 'The installation changed. Refresh before retrying.');
            $installation->update(['state' => $to, 'version' => $installation->version + 1]);

            return $this->result($organizationId, $installation);
        });
    }

    private function authorized(User|PlatformUser $actor, int $organizationId, bool $ownerOnly = false): OrganizationMembership
    {
        abort_unless($actor->getKey() !== null && $actor::query()->whereKey($actor->getKey())
            ->where('account_status', 'active')->exists(), 403);
        $organization = Organization::query()->whereKey($organizationId)->lockForUpdate()->firstOrFail();
        abort_unless($organization->status === Organization::Active, 403);
        $column = $actor instanceof PlatformUser ? 'platform_user_id' : 'user_id';
        $other = $actor instanceof PlatformUser ? 'user_id' : 'platform_user_id';
        $membership = OrganizationMembership::query()->where('organization_id', $organizationId)
            ->where($column, $actor->id)->whereNull($other)->lockForUpdate()->first();
        abort_unless($membership?->status === OrganizationMembership::Active
            && in_array($membership->role, [OrganizationMembership::Member, OrganizationMembership::Admin, OrganizationMembership::Owner], true), 404);
        abort_unless(! $ownerOnly || $membership->role === OrganizationMembership::Owner, 403);
        abort_unless(config('platform.applications.framework.available') === true, 403);
        abort_unless(OrganizationApplication::query()->where('organization_id', $organizationId)
            ->where('application_key', 'framework')->where('state', OrganizationApplication::Installed)->exists()
            && ApplicationEntitlementGrant::activeFor($organizationId, 'framework')->exists(), 403);

        return $membership;
    }

    private function requireInstallable(string $applicationKey): void
    {
        abort_unless(! in_array($applicationKey, ['framework', 'commerce'], true)
            && ApplicationDefinition::query()->where('application_key', $applicationKey)->exists()
            && $this->installable($applicationKey, config('platform.applications.'.$applicationKey)), 403,
            'Application provisioning is unavailable.');
    }

    private function installable(string $applicationKey, mixed $descriptor): bool
    {
        return $applicationKey !== 'commerce' && is_array($descriptor) && ($descriptor['available'] ?? false) === true
            && ($applicationKey === 'framework' || ($descriptor['provisioned'] ?? false) === true)
            && is_string($descriptor['name'] ?? null) && $descriptor['name'] !== ''
            && is_string($descriptor['service'] ?? null) && $descriptor['service'] !== ''
            && is_string($descriptor['contract_version'] ?? null) && $descriptor['contract_version'] !== '';
    }

    private function requireEntitlement(int $organizationId, string $applicationKey): void
    {
        abort_unless(ApplicationEntitlementGrant::activeFor($organizationId, $applicationKey)
            ->lockForUpdate()->exists(), 403, 'Application entitlement is unavailable.');
    }

    private function validated(Request $request): array
    {
        $input = $request->all();
        foreach (array_diff(array_keys($input), ['expected_version']) as $field) {
            throw ValidationException::withMessages([$field => 'The field is not supported.']);
        }

        return Validator::make($input, ['expected_version' => 'required|integer:strict|min:0'])->validate();
    }

    private function catalogInput(Request $request): array
    {
        $input = $request->all();
        foreach (array_diff(array_keys($input), ['page', 'per_page', 'application_key']) as $field) {
            throw ValidationException::withMessages([$field => 'The field is not supported.']);
        }
        foreach (['page', 'per_page'] as $field) {
            if (isset($input[$field]) && is_string($input[$field]) && preg_match('/^[1-9][0-9]*$/D', $input[$field])) {
                $input[$field] = (int) $input[$field];
            }
        }

        return Validator::make($input, ['page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50',
            'application_key' => 'sometimes|string|max:80|exists:application_definitions,application_key'])->validate();
    }

    private function result(int $organizationId, OrganizationApplication $installation): array
    {
        return ['organization_id' => $organizationId,
            'application' => ['id' => $installation->id, 'application_key' => $installation->application_key,
                'state' => $installation->state, 'version' => $installation->version]];
    }
}
