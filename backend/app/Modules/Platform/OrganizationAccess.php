<?php

namespace App\Modules\Platform;

use App\Models\ApplicationEntitlementGrant;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use InvalidArgumentException;

class OrganizationAccess
{
    private const ApplicationKeys = ['erp', 'hr', 'learning', 'insights', 'crm', 'helpdesk', 'lending', 'framework', 'builder', 'commerce'];

    private const Roles = [
        OrganizationMembership::Member => [OrganizationMembership::Member, OrganizationMembership::Admin, OrganizationMembership::Owner],
        OrganizationMembership::Admin => [OrganizationMembership::Admin, OrganizationMembership::Owner],
        OrganizationMembership::Owner => [OrganizationMembership::Owner],
    ];

    /**
     * Read current access state. A worker must repeat this inside its locked business transaction.
     */
    public function allows(User|PlatformUser|null $user, int $organizationId, string $applicationKey, string $minimumRole = OrganizationMembership::Member): bool
    {
        if (! isset(self::Roles[$minimumRole]) || ! in_array($applicationKey, $this->availableApplicationKeys(), true)) {
            return false;
        }

        return $this->hasActiveMembership($user, $organizationId, self::Roles[$minimumRole])
            && ApplicationEntitlementGrant::activeFor($organizationId, $applicationKey)->exists()
            && OrganizationApplication::query()
                ->where('organization_id', $organizationId)
                ->where('application_key', $applicationKey)
                ->where('state', OrganizationApplication::Installed)
                ->exists();
    }

    public function enforce(User|PlatformUser|null $user, int $organizationId, string $applicationKey, string $minimumRole = OrganizationMembership::Member): void
    {
        abort_unless($this->allows($user, $organizationId, $applicationKey, $minimumRole), 403, 'Organization application access is unavailable.');
    }

    public function grantedApplications(User|PlatformUser|null $user, int $organizationId, int $page = 1, int $perPage = 20): LengthAwarePaginator
    {
        if ($page < 1 || $perPage < 1 || $perPage > 50) {
            throw new InvalidArgumentException('Invalid application page or page size.');
        }

        $query = OrganizationApplication::query()
            ->where('organization_id', $organizationId)
            ->where('state', OrganizationApplication::Installed)
            ->whereIn('application_key', $this->availableApplicationKeys());

        if (! $this->hasActiveMembership($user, $organizationId, self::Roles[OrganizationMembership::Member])) {
            $query->whereRaw('1 = 0');
        } else {
            $keys = ApplicationEntitlementGrant::query()->where('organization_id', $organizationId)
                ->activeAt()->pluck('application_key')->all();
            $query->whereIn('application_key', $keys);
        }

        return $query->orderBy('id')->paginate($perPage, ['id', 'application_key', 'state'], 'page', $page);
    }

    private function hasActiveMembership(User|PlatformUser|null $user, int $organizationId, array $roles): bool
    {
        if ($user === null || $user->getKey() === null) {
            return false;
        }

        $principalColumn = $user instanceof PlatformUser ? 'platform_user_id' : 'user_id';
        $otherPrincipalColumn = $user instanceof PlatformUser ? 'user_id' : 'platform_user_id';

        return $user::query()->whereKey($user->getKey())->where('account_status', 'active')->exists()
            && Organization::query()->whereKey($organizationId)->where('status', Organization::Active)->exists()
            && OrganizationMembership::query()
                ->where('organization_id', $organizationId)
                ->where($principalColumn, $user->getKey())
                ->whereNull($otherPrincipalColumn)
                ->where('status', OrganizationMembership::Active)
                ->whereIn('role', $roles)
                ->exists();
    }

    private function availableApplicationKeys(): array
    {
        $applications = config('platform.applications', []);
        if (! is_array($applications)) {
            return [];
        }

        return array_values(array_filter(self::ApplicationKeys, fn (string $key): bool => is_array($applications[$key] ?? null)
            && ($applications[$key]['available'] ?? null) === true));
    }
}
