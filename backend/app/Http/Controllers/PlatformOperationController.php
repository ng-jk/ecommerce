<?php

namespace App\Http\Controllers;

use App\Domain\SolutionCommerce;
use App\Models\Operation;
use App\Models\PlatformUser;
use App\Modules\Events\Interface\Events;
use App\Modules\Platform\ApplicationActions;
use App\Modules\Platform\MembershipActions;
use App\Modules\Platform\OrganizationActions;
use App\Modules\Platform\PlatformAssistantActions;
use App\Modules\Platform\Services\RemoteCommandCoordinator;
use App\Modules\Platform\Services\RemoteResultGuard;
use App\Modules\Platform\Services\ServiceResultAuthority;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

class PlatformOperationController extends Controller
{
    public function submit(Request $request): JsonResponse
    {
        abort_if(strlen($request->getContent()) > 65536, 413);
        $action = $request->route()->getName();
        $action = str_starts_with($action, 'standalone.') ? substr($action, strlen('standalone.')) : $action;
        abort_unless((config('platform.actions', [])[$action] ?? false) === true, 403);
        $public = in_array($action, ['platform.auth.register', 'platform.auth.login'], true);
        $viewer = $request->user('sanctum');
        abort_unless($viewer === null || $viewer instanceof PlatformUser, 403);
        abort_unless($public || $viewer, 401);
        if ($viewer) {
            abort_unless($viewer->account_status === PlatformUser::Active, 403);
            $accessToken = $viewer->currentAccessToken();
            abort_unless(! ($accessToken instanceof PersonalAccessToken) || $accessToken->can('platform'), 403);
        }
        $key = $request->header('Idempotency-Key');
        $receipt = $request->header('X-Operation-Token');
        $this->validate(Request::create('/', 'POST', ['key' => $key, 'receipt' => $receipt]), [
            'key' => 'required|uuid', 'receipt' => 'required|string|size:64|regex:/^[a-f0-9]+$/',
        ]);
        $payload = ['input' => $request->all(), 'id' => $request->route('id'), 'membership_id' => $request->route('membership_id'),
            'organization_id' => $request->route('organization_id'), 'application_key' => $request->route('applicationKey')];
        $scope = 'platform:'.($viewer?->id ?? 'guest').':'.$action;
        $hash = hash_hmac('sha256', json_encode([$action, $this->canonical($payload)], JSON_THROW_ON_ERROR), config('app.key'));
        $operation = DB::transaction(function () use ($scope, $key, $receipt, $hash, $payload, $action, $viewer): Operation {
            if (DB::getDriverName() === 'pgsql') {
                DB::select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [$scope]);
            }
            if ($viewer) {
                $current = PlatformUser::whereKey($viewer->id)->lockForUpdate()->firstOrFail();
                abort_unless($current->account_status === PlatformUser::Active && $current->auth_version === $viewer->auth_version, 403);
            }
            $existing = Operation::where('scope', $scope)->where('idempotency_key', $key)->first();
            if ($existing) {
                abort_unless(hash_equals($existing->payload_hash, $hash) && hash_equals($existing->receipt_hash, hash('sha256', $receipt)), 409);

                return $existing;
            }
            abort_if(Operation::where('scope', $scope)->whereIn('status', [Operation::Queued, Operation::Processing])->count() >= 50, 429);
            $token = $viewer?->currentAccessToken();
            $created = Operation::create(['public_id' => (string) Str::uuid(), 'shop_id' => null, 'user_id' => null,
                'platform_user_id' => $viewer?->id, 'auth_version' => $viewer?->auth_version,
                'token_id' => $token instanceof PersonalAccessToken ? $token->id : null,
                'scope' => $scope, 'idempotency_key' => $key, 'payload_hash' => $hash,
                'receipt_hash' => hash('sha256', $receipt), 'action' => $action, 'payload' => $payload,
                'status' => Operation::Queued, 'available_at' => now()]);
            app(Events::class)->wake();

            return $created;
        }, 3);

        return response()->json(['operation_id' => $operation->public_id, 'status' => $operation->status,
            'poll_url' => '/api/v1/platform/operations/'.$operation->public_id], 202);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $response = DB::transaction(fn (): JsonResponse => $this->showLocked($request, $id), 3);
        if ($response->getData(true)['status'] !== Operation::Succeeded) {
            return $response;
        }
        $snapshot = Operation::where('public_id', $id)->firstOrFail();
        $authorizedResult = $snapshot->result;
        unset($authorizedResult['auth_version']);
        abort_unless($authorizedResult === $response->getData(true)['result'], 409);
        app(RemoteResultGuard::class)->authorize($snapshot);

        // Recheck central authority after the remote snapshot; neither database lock spans the network.
        return DB::transaction(function () use ($request, $id, $response): JsonResponse {
            $current = $this->showLocked($request, $id);
            abort_unless(ServiceResultAuthority::digest($current->getData(true))
                === ServiceResultAuthority::digest($response->getData(true)), 409);

            return $current;
        }, 3);
    }

    private function showLocked(Request $request, string $id): JsonResponse
    {
        $operation = Operation::whereNull('shop_id')->whereNull('user_id')->where('public_id', $id)->firstOrFail();
        abort_unless(hash_equals($operation->receipt_hash, hash('sha256', (string) $request->header('X-Operation-Token'))), 404);
        abort_unless((config('platform.actions', [])[$operation->action] ?? false) === true, 403);
        $viewer = $request->user('sanctum');
        $effectiveAction = $operation->action === 'platform.assistant' ? ($operation->result['executed_action'] ?? null) : $operation->action;
        $completedLogout = $effectiveAction === 'platform.auth.logout' && $operation->status === Operation::Succeeded;
        if ($operation->platform_user_id && ! $completedLogout) {
            abort_unless($viewer instanceof PlatformUser && $viewer->id === $operation->platform_user_id, 404);
            $viewer = PlatformUser::whereKey($viewer->id)->lockForUpdate()->firstOrFail();
            abort_unless($viewer->account_status === PlatformUser::Active && $viewer->auth_version === $operation->auth_version, 403);
        }
        $result = $operation->result;
        if ($operation->status === Operation::Succeeded && $operation->action === 'platform.assistant' && ! $completedLogout) {
            abort_unless($viewer instanceof PlatformUser, 404);
            app(PlatformAssistantActions::class)->authorizeResult($viewer, $result ?? []);
        } elseif ($operation->status === Operation::Succeeded && in_array(explode('.', $operation->action)[0], config('platform.service_names'), true)) {
            abort_unless($viewer instanceof PlatformUser, 404);
            app(RemoteCommandCoordinator::class)->authorize($viewer,
                (int) $operation->payload['organization_id'], explode('.', $operation->action)[0], $operation->action);
        } elseif ($operation->status === Operation::Succeeded && ! $completedLogout && str_starts_with($operation->action, 'platform.') && ! str_starts_with($operation->action, 'platform.auth.')) {
            abort_unless($viewer instanceof PlatformUser, 404);
            $guard = str_starts_with($operation->action, 'platform.membership') ? app(MembershipActions::class)
                : (str_starts_with($operation->action, 'platform.application.') ? app(ApplicationActions::class)
                    : (str_starts_with($operation->action, 'platform.solution.') ? app(SolutionCommerce::class) : app(OrganizationActions::class)));
            $guard->authorizeResult($viewer, $operation->action, $operation->payload, $result ?? []);
        }
        if ($operation->status === Operation::Succeeded && in_array($operation->action, ['platform.auth.register', 'platform.auth.login'], true)) {
            $identity = PlatformUser::whereKey($result['user']['id'])->lockForUpdate()->firstOrFail();
            abort_unless($identity->account_status === PlatformUser::Active && $identity->auth_version === ($result['auth_version'] ?? null), 403);
            $token = PersonalAccessToken::findToken($result['token']);
            abort_unless($token && $token->tokenable_type === $identity->getMorphClass() && $token->tokenable_id === $identity->id
                && $token->can('platform') && (! $token->expires_at || $token->expires_at->isFuture()), 403);
        }
        unset($result['auth_version']);

        return response()->json(['operation_id' => $operation->public_id, 'status' => $operation->status,
            'http_status' => $operation->http_status, 'result' => $result, 'state' => $operation->state_after]);
    }

    private function canonical(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }

        return array_map(fn ($item) => is_array($item) ? $this->canonical($item) : $item, $value);
    }
}
