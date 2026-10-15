<?php

namespace App\Modules\Platform;

use App\Domain\SolutionActions;
use App\Models\Operation;
use App\Models\PlatformUser;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class PlatformActionExecutor
{
    public function execute(Operation $operation): array
    {
        abort_unless($operation->shop_id === null && $operation->user_id === null, 403);
        abort_unless((config('platform.actions', [])[$operation->action] ?? false) === true, 403);
        $public = in_array($operation->action, ['platform.auth.register', 'platform.auth.login'], true);
        $user = $operation->platform_user_id ? PlatformUser::whereKey($operation->platform_user_id)->lockForUpdate()->first() : null;
        abort_unless($public || $user, 401);
        if ($operation->platform_user_id) {
            abort_unless($user && $user->account_status === PlatformUser::Active && $user->auth_version === $operation->auth_version, 403);
            if ($operation->token_id) {
                $token = PersonalAccessToken::find($operation->token_id);
                abort_unless($token && $token->tokenable_type === $user->getMorphClass()
                    && $token->tokenable_id === $user->id && $token->can('platform') && (! $token->expires_at || $token->expires_at->isFuture()), 401);
            }
        }
        $operation->state_before = ['account_status' => $user?->account_status];
        $request = Request::create('/', 'POST', $operation->payload['input']);
        $request->setUserResolver(fn () => $user);
        $auth = app(PlatformAuthActions::class);
        $organizations = app(OrganizationActions::class);
        $memberships = app(MembershipActions::class);
        $id = (int) ($operation->payload['id'] ?? 0);
        $membershipId = (int) ($operation->payload['membership_id'] ?? 0);
        $result = match ($operation->action) {
            'platform.assistant' => app(PlatformAssistantActions::class)->run($operation, $user),
            'platform.auth.register' => $auth->register($request),
            'platform.auth.login' => $auth->login($request),
            'platform.auth.me' => $auth->me($user),
            'platform.auth.logout' => $auth->logout($user),
            'platform.organizations' => $organizations->listing($request, $user),
            'platform.organization.create' => $organizations->create($request, $user),
            'platform.organization' => $organizations->detail($user, $id),
            'platform.organization.update' => $organizations->update($request, $user, $id),
            'platform.application.catalog' => app(ApplicationActions::class)->catalog($request, $user, $id),
            'platform.application.install' => app(ApplicationActions::class)->install($request, $user, $id, $operation->payload['application_key']),
            'platform.application.disable' => app(ApplicationActions::class)->disable($request, $user, $id, $operation->payload['application_key']),
            'platform.application.reenable' => app(ApplicationActions::class)->reenable($request, $user, $id, $operation->payload['application_key']),
            'platform.solution.purchases' => app(SolutionActions::class)->purchases($request, $user, $id),
            'platform.solution.purchase' => app(SolutionActions::class)->purchase($request, $user, $id),
            'platform.solution.retry' => app(SolutionActions::class)->retry($request, $user, $id),
            'platform.applications' => $organizations->applications($request, $user, $id),
            'platform.memberships' => $memberships->listing($request, $user, $id),
            'platform.membership' => $memberships->detail($user, $id, $membershipId),
            'platform.membership.invite' => $memberships->invite($request, $user, $id),
            'platform.membership.role' => $memberships->changeRole($request, $user, $id, $membershipId),
            'platform.membership.revoke' => $memberships->revoke($request, $user, $id, $membershipId),
            'platform.membership.accept' => $memberships->accept($request, $user, $id, $membershipId),
            default => in_array(explode('.', $operation->action)[0], config('platform.service_names'), true)
                ? app(Services\RemoteCommandCoordinator::class)->execute($operation, $user)
                : throw ValidationException::withMessages(['action' => 'Unknown platform command.']),
        };
        $operation->state_after = ['account_status' => $operation->action === 'platform.auth.logout' ? null : ($result['user']['account_status'] ?? $user?->account_status),
            'action' => $operation->action];

        return $result;
    }
}
