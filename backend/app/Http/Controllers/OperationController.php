<?php

namespace App\Http\Controllers;

use App\Domain\AccessPolicy;
use App\Models\Operation;
use App\Models\Shop;
use App\Models\User;
use App\Modules\Events\Interface\Events;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class OperationController extends Controller
{
    public function submit(Request $request, Shop $shop): JsonResponse
    {
        abort_if(strlen($request->getContent()) > 65536, 413);
        $action = $request->route()->getName();
        $public = in_array($action, ['catalog', 'product', 'auth.login', 'auth.register', 'assistant'], true);
        $user = $request->user('sanctum');
        abort_unless($public || $user, 401);
        if ($user) {
            abort_unless($user->shop_id === $shop->id && $user->account_status === 'active', 403);
        }
        if (str_starts_with($action, 'admin.')) {
            abort_unless($user?->role === User::Admin, 403);
        }
        if ($action !== 'assistant') {
            app(AccessPolicy::class)->enforceInShop($action, $user, $shop);
        }
        $key = $request->header('Idempotency-Key');
        $receipt = $request->header('X-Operation-Token');
        $this->validate(Request::create('/', 'POST', ['key' => $key, 'receipt' => $receipt]), ['key' => 'required|uuid', 'receipt' => 'required|string|size:64|regex:/^[a-f0-9]+$/']);
        $payload = ['input' => $request->all(), 'id' => $request->route('id')];
        $hash = hash_hmac('sha256', json_encode([$action, $this->canonical($payload)], JSON_THROW_ON_ERROR), config('app.key'));
        $scope = $shop->id.':'.($user?->id ?? 'guest').':'.$action;
        $operation = DB::transaction(function () use ($scope, $key, $hash, $receipt, $shop, $user, $action, $payload) {
            // The scope lock serializes admission, including creation of a new key.
            if ($user) {
                User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            } else {
                Shop::whereKey($shop->id)->lockForUpdate()->firstOrFail();
            }
            $existing = Operation::where('scope', $scope)->where('idempotency_key', $key)->first();
            if ($existing) {
                abort_unless(hash_equals($existing->payload_hash, $hash) && hash_equals($existing->receipt_hash, hash('sha256', $receipt)), 409, 'Idempotency key already has a different request.');

                return $existing;
            }
            abort_if(Operation::where('scope', $scope)->whereIn('status', [Operation::Queued, Operation::Processing])->count() >= 50, 429, 'Too many pending operations.');
            $token = $user?->currentAccessToken();

            $created = Operation::create(['public_id' => (string) Str::uuid(), 'shop_id' => $shop->id, 'user_id' => $user?->id, 'auth_version' => $user?->auth_version, 'token_id' => $token instanceof PersonalAccessToken ? $token->id : null, 'scope' => $scope, 'idempotency_key' => $key, 'payload_hash' => $hash, 'receipt_hash' => hash('sha256', $receipt), 'action' => $action, 'payload' => $payload, 'status' => Operation::Queued, 'available_at' => now()]);
            app(Events::class)->wake();

            return $created;
        });

        return response()->json(['operation_id' => $operation->public_id, 'status' => $operation->status, 'poll_url' => '/api/v1/shops/'.$shop->slug.'/operations/'.$operation->public_id], 202);
    }

    public function show(Request $request, Shop $shop, string $id): JsonResponse
    {
        // Resolve identity first: logout commits token revocation and its receipt atomically.
        $viewer = $request->user('sanctum');
        $op = Operation::where('shop_id', $shop->id)->where('public_id', $id)->firstOrFail();
        abort_unless(hash_equals($op->receipt_hash, hash('sha256', (string) $request->header('X-Operation-Token'))), 404);
        $effectiveAction = $op->action === 'assistant' ? ($op->result['executed_action'] ?? null) : $op->action;
        $effectiveResult = $op->action === 'assistant' ? ($op->result['api_result'] ?? []) : $op->result;
        if ($op->user_id && ! ($effectiveAction === 'auth.logout' && $op->status === Operation::Succeeded)) {
            abort_unless($viewer?->id === $op->user_id && $viewer?->shop_id === $shop->id, 404);
            abort_unless($viewer->account_status === 'active', 403);
        }

        if ($op->status === Operation::Succeeded && in_array($effectiveAction, ['auth.login', 'auth.register'], true)) {
            $user = User::findOrFail($effectiveResult['user']['id']);
            abort_unless($user->account_status === 'active' && $user->auth_version === ($effectiveResult['auth_version'] ?? null), 403);
            if (! isset($effectiveResult['token'])) {
                if (! $request->hasSession()) {
                    throw ValidationException::withMessages(['session' => 'Browser session required.']);
                }
                Auth::guard('web')->login($user);
                $request->session()->regenerate();
            }
        }
        if ($op->status === Operation::Succeeded && $effectiveAction === 'auth.logout' && $request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        $result = $op->result;
        unset($result['auth_version'], $result['api_result']['auth_version']);

        return response()->json(['operation_id' => $op->public_id, 'status' => $op->status, 'http_status' => $op->http_status, 'result' => $result, 'state' => $op->state_after]);
    }

    private function canonical(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }

        return array_map(fn ($entry) => is_array($entry) ? $this->canonical($entry) : $entry, $value);
    }
}
