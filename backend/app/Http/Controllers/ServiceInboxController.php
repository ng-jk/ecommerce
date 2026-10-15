<?php

namespace App\Http\Controllers;

use App\Models\ApplicationEntitlementGrant;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Modules\Platform\Services\RemoteCommandCoordinator;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceResultAuthority;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

class ServiceInboxController extends Controller
{
    public function inbox(Request $request, ServiceAuthentication $authentication, ServiceExchange $exchange): JsonResponse
    {
        $binding = $authentication->authenticate($request);
        try {
            $message = json_decode($request->getContent(), true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return response()->json(['validation_error' => ['message' => ['Invalid JSON service envelope.']]], 422);
        }
        if (! is_array($message)) {
            return response()->json(['validation_error' => ['message' => ['Invalid service envelope.']]], 422);
        }
        abort_unless(in_array($message['topic'] ?? null, $binding['peer']['topics'] ?? [], true), 403);
        try {
            $receipt = $exchange->accept($message, $binding['source'], $binding['destination']);
        } catch (\InvalidArgumentException) {
            return response()->json(['validation_error' => ['message' => ['Invalid service envelope.']]], 422);
        } catch (\DomainException) {
            abort(409, 'Service message conflict.');
        }

        return $this->signed($receipt, 202, $binding);
    }

    public function authorize(Request $request, ServiceAuthentication $authentication): JsonResponse
    {
        $binding = $authentication->authenticate($request);
        $this->validate($request, ['nonce' => 'required|uuid', 'scope' => 'required|array:platform_user_id,organization_id,application,action,auth_version,token_id,subject_platform_user_id',
            'scope.platform_user_id' => 'required|integer:strict|min:1', 'scope.organization_id' => 'required|integer:strict|min:1',
            'scope.application' => 'required|string', 'scope.action' => 'required|string',
            'scope.subject_platform_user_id' => 'sometimes|integer:strict|min:1',
            'scope.auth_version' => 'required|integer:strict|min:0', 'scope.token_id' => 'required|integer:strict|min:1']);
        $scope = $request->input('scope');
        $roles = $binding['peer']['actions'][$scope['action']] ?? [];
        $application = $binding['peer']['application'] ?? null;
        $allowed = $application === $scope['application'] && str_starts_with($scope['action'], $application.'.')
            && is_array($roles) && $roles !== [] && config('platform.applications.'.$application.'.available') === true
            && config('platform.applications.'.$application.'.provisioned') === true
            && (config('platform.actions', [])[$scope['action']] ?? false) === true;
        if ($allowed) {
            $allowed = DB::transaction(function () use ($scope, $roles): bool {
                $user = PlatformUser::whereKey($scope['platform_user_id'])->lockForUpdate()->first();
                $organization = Organization::whereKey($scope['organization_id'])->lockForUpdate()->first();
                $member = OrganizationMembership::where('organization_id', $scope['organization_id'])
                    ->where('platform_user_id', $scope['platform_user_id'])->whereNull('user_id')->lockForUpdate()->first();
                $installation = OrganizationApplication::where('organization_id', $scope['organization_id'])
                    ->where('application_key', $scope['application'])->lockForUpdate()->first();
                $token = PersonalAccessToken::find($scope['token_id']);

                return $user && $user->account_status === PlatformUser::Active && $user->auth_version === $scope['auth_version']
                    && app(RemoteCommandCoordinator::class)->subjectAllowed($scope['action'], $scope['organization_id'], $scope['subject_platform_user_id'] ?? null)
                    && $organization && $organization->status === Organization::Active
                    && $member && $member->status === OrganizationMembership::Active && in_array($member->role, $roles, true)
                    && $installation && $installation->state === OrganizationApplication::Installed
                    && ApplicationEntitlementGrant::activeFor($scope['organization_id'], $scope['application'])->exists()
                    && $token && $token->tokenable_type === $user->getMorphClass() && $token->tokenable_id === $user->id
                    && $token->can('platform') && (! $token->expires_at || $token->expires_at->isFuture());
            });
        }

        return $this->signed(['nonce' => $request->input('nonce'), 'allowed' => $allowed], 200, $binding);
    }

    public function resultAuthority(Request $request, ServiceAuthentication $authentication, ServiceResultAuthority $authority): JsonResponse
    {
        $binding = $authentication->authenticate($request);
        abort_unless($binding['source'] === 'platform' && ($binding['peer']['application'] ?? null) === $binding['destination'], 403);
        $this->validate($request, ['command_id' => 'required|uuid', 'operation_id' => 'required|uuid', 'nonce' => 'required|uuid',
            'scope' => 'required|array:platform_user_id,organization_id,application,action,auth_version,token_id,subject_platform_user_id',
            'scope.platform_user_id' => 'required|integer:strict|min:1', 'scope.organization_id' => 'required|integer:strict|min:1',
            'scope.application' => 'required|string', 'scope.action' => 'required|string', 'scope.auth_version' => 'required|integer:strict|min:0',
            'scope.token_id' => 'required|integer:strict|min:1', 'scope.subject_platform_user_id' => 'sometimes|integer:strict|min:1',
            'result_digest' => 'required|string|regex:/^[a-f0-9]{64}$/D']);

        return $this->signed(['nonce' => $request->input('nonce'), 'allowed' => $authority->allows($binding['destination'], $request->all())], 200, $binding);
    }

    private function signed(array $body, int $status, array $binding): JsonResponse
    {
        $response = response()->json($body, $status);
        $response->header('X-Service-Receipt', ServiceAuthentication::receipt($binding['key'], $binding['nonce'], $response->getContent()));

        return $response;
    }
}
