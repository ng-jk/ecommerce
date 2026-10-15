<?php

namespace App\Modules\Platform;

use App\Domain\Assistant\FunctionGemma;
use App\Domain\Assistant\ToolInput;
use App\Domain\SolutionCommerce;
use App\Models\Operation;
use App\Models\OrganizationApplication;
use App\Models\PlatformConversation as Conversation;
use App\Models\PlatformUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class PlatformAssistantActions
{
    public function run(Operation $operation, PlatformUser $user): array
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Platform assistant requires the durable worker transaction.');
        }
        $user = PlatformUser::whereKey($user->id)->lockForUpdate()->firstOrFail();
        abort_unless($operation->platform_user_id === $user->id && $operation->auth_version === $user->auth_version
            && $user->account_status === PlatformUser::Active, 403);
        $delegated = $operation->exists ? Operation::where('parent_operation_id', $operation->id)->first() : null;
        if ($delegated) {
            $conversation = Conversation::where('public_id', $delegated->payload['conversation_id'])->where('platform_user_id', $user->id)->lockForUpdate()->firstOrFail();
            abort_unless(hash_equals($conversation->receipt_hash, $operation->receipt_hash)
                && $conversation->auth_version === $user->auth_version, 403);
            abort_if($conversation->expires_at->isPast(), 410);

            return $this->execute($conversation, app(PlatformToolRegistry::class)->find($conversation->action, $user), $conversation->draft['prepared'], $operation);
        }
        $input = Validator::make(['turn' => $operation->payload['input']], [
            'turn' => 'required|array:conversation_id,conversation_version,message,data,action,confirm,discover',
            'turn.conversation_id' => 'sometimes|uuid', 'turn.conversation_version' => 'required_with:turn.conversation_id|integer:strict|min:0',
            'turn.message' => 'sometimes|string|max:2000', 'turn.data' => 'sometimes|array',
            'turn.action' => 'sometimes|string|max:80', 'turn.confirm' => 'sometimes|boolean:strict', 'turn.discover' => 'sometimes|boolean:strict',
        ])->validate()['turn'];
        $registry = app(PlatformToolRegistry::class);
        $available = $registry->available($user);
        if ($input['discover'] ?? false) {
            return ['status' => Conversation::Draft, 'message' => 'Choose a platform action or describe a request.',
                'available_actions' => array_map($registry->describe(...), $available), 'required_input' => [['field' => 'message', 'type' => 'string']]];
        }
        if (isset($input['conversation_id'])) {
            $conversation = Conversation::where('public_id', $input['conversation_id'])->where('platform_user_id', $user->id)->lockForUpdate()->firstOrFail();
            abort_unless(hash_equals($conversation->receipt_hash, $operation->receipt_hash), 404);
            abort_unless($conversation->auth_version === $user->auth_version, 403);
            abort_if($conversation->expires_at->isPast(), 410, 'Conversation expired.');
            abort_unless($conversation->version === $input['conversation_version'], 409, 'Conversation changed.');
            if ($conversation->status === Conversation::Complete) {
                $this->authorizeResult($user, $conversation->result);

                return $conversation->result;
            }
        } else {
            $conversation = Conversation::create(['public_id' => (string) Str::uuid(), 'platform_user_id' => $user->id,
                'auth_version' => $user->auth_version, 'receipt_hash' => $operation->receipt_hash, 'draft' => [],
                'expires_at' => now()->addMinutes((int) config('assistant.ttl_minutes', 15))]);
        }
        $draft = $conversation->draft;
        if (isset($draft['delegated_operation_id'])) {
            $pending = Operation::findOrFail($draft['delegated_operation_id']);
            abort_unless($pending->parent_operation_id === $operation->id, 409, 'This preview already has a pending confirmation.');
        }
        $arguments = $draft['arguments'] ?? [];
        $name = $conversation->action ?? ($input['action'] ?? null);
        if ($conversation->action && isset($input['action']) && $input['action'] !== $conversation->action) {
            throw ValidationException::withMessages(['action' => 'Start a new conversation to change action.']);
        }
        if ($input['confirm'] ?? false) {
            abort_unless($conversation->status === Conversation::Confirm && empty($input['data']) && empty($input['message']), 409, 'Confirm the unchanged preview in a separate turn.');

            return $this->execute($conversation, $registry->find($name, $user), $draft['prepared'], $operation);
        }
        if (! empty($input['message'])) {
            $proposal = app(FunctionGemma::class)->propose($input['message'], $name ? [$registry->find($name, $user)] : $available, $arguments);
            if ($name && $proposal['name'] !== $name) {
                throw ValidationException::withMessages(['message' => 'The reply did not match the pending action.']);
            }
            $name = $proposal['name'];
            $arguments = array_replace_recursive($arguments, $proposal['arguments']);
        }
        if (! $name) {
            throw ValidationException::withMessages(['message' => 'Describe an action or select one from discovery.']);
        }
        $tool = $registry->find($name, $user);
        $arguments = array_replace_recursive($arguments, $input['data'] ?? []);
        $missing = app(ToolInput::class)->check($tool['parameters'], $arguments);
        $conversation->action = $name;
        $conversation->version++;
        $conversation->status = $missing ? Conversation::Draft : Conversation::Confirm;
        $prepared = $missing ? [] : $this->prepare($tool['action'], $arguments, $user);
        $conversation->draft = ['arguments' => $arguments, 'prepared' => $prepared];
        $conversation->save();
        if (! $missing && ! $tool['confirmation'] && empty($input['message'])) {
            return $this->execute($conversation, $tool, $prepared, $operation);
        }

        return ['conversation_id' => $conversation->public_id, 'conversation_version' => $conversation->version,
            'status' => $conversation->status, 'message' => $missing ? 'Provide the required input.' : 'Review and confirm this unchanged preview in a separate turn.',
            'available_actions' => [$registry->describe($tool)], 'collected_data' => $arguments, 'required_input' => $missing,
            'preview' => $prepared, 'options' => Conversation::options()];
    }

    public function authorizeResult(PlatformUser $user, array $result): void
    {
        $current = PlatformUser::findOrFail($user->id);
        abort_unless($current->account_status === PlatformUser::Active && $current->auth_version === $user->auth_version, 403);
        if (! isset($result['conversation_id'])) {
            return;
        }
        $conversation = Conversation::where('public_id', $result['conversation_id'])->where('platform_user_id', $user->id)->firstOrFail();
        abort_unless($conversation->auth_version === $current->auth_version, 403);
        abort_if($conversation->expires_at->isPast(), 410);
        $action = $result['executed_action'] ?? null;
        if (! $action) {
            if ($conversation->status === Conversation::Confirm) {
                $tool = app(PlatformToolRegistry::class)->find($conversation->action, $current);
                $this->prepare($tool['action'], $conversation->draft['arguments'], $current);
            }

            return;
        }
        app(PlatformToolRegistry::class)->find($conversation->action, $current);
        if (str_starts_with($action, 'platform.auth.')) {
            return;
        }
        if (in_array(explode('.', $action)[0], config('platform.service_names'), true)) {
            DB::transaction(fn () => app(Services\RemoteCommandCoordinator::class)->authorize($current,
                (int) $conversation->draft['prepared']['organization_id'], explode('.', $action)[0], $action));

            return;
        }
        $guard = str_starts_with($action, 'platform.application.') ? app(ApplicationActions::class)
            : (str_starts_with($action, 'platform.solution.') ? app(SolutionCommerce::class)
                : (str_starts_with($action, 'platform.membership') ? app(MembershipActions::class) : app(OrganizationActions::class)));
        $guard->authorizeResult($current, $action, $conversation->draft['prepared'], $result['api_result']);
    }

    private function prepare(string $action, array $arguments, PlatformUser $user): array
    {
        $applicationKey = $arguments['applicationKey'] ?? null;
        unset($arguments['applicationKey']);
        $organizationId = $arguments['organization'] ?? $arguments['organization_id'] ?? null;
        unset($arguments['organization'], $arguments['organization_id']);
        if (in_array(explode('.', $action)[0], config('platform.service_names'), true)) {
            app(Services\RemoteCommandCoordinator::class)->authorize($user, (int) $organizationId, explode('.', $action)[0], $action);
        }
        $id = $arguments['id'] ?? null;
        $membershipId = $arguments['membership_id'] ?? null;
        unset($arguments['id'], $arguments['membership_id']);
        if (in_array($action, ['platform.application.install', 'platform.application.disable', 'platform.application.reenable'], true)) {
            $catalog = app(ApplicationActions::class)->catalog(Request::create('/', 'GET'), $user, (int) $id);
            abort_unless($catalog['meta']['can_manage'], 403);
            $installation = OrganizationApplication::where('organization_id', $id)->where('application_key', $applicationKey)->first();
            $arguments['expected_version'] = $installation?->version ?? 0;
        }
        if ($action === 'platform.organization.update') {
            $detail = app(OrganizationActions::class)->detail($user, (int) $id);
            abort_unless($detail['can_update'], 403);
            $arguments['expected_version'] = $detail['organization']['version'];
        }
        if (in_array($action, ['platform.membership.role', 'platform.membership.revoke', 'platform.membership.accept'], true)) {
            $detail = app(MembershipActions::class)->detail($user, (int) $id, (int) $membershipId);
            abort_unless($action === 'platform.membership.accept' || $detail['can_manage'], 403);
            $arguments['expected_version'] = $detail['membership']['version'];
        }

        return ['input' => $arguments, 'id' => $id, 'membership_id' => $membershipId, 'organization_id' => $organizationId, 'application_key' => $applicationKey];
    }

    private function execute(Conversation $conversation, array $tool, array $prepared, Operation $parent): array
    {
        $child = new Operation(['shop_id' => null, 'user_id' => null, 'platform_user_id' => $parent->platform_user_id,
            'auth_version' => $parent->auth_version, 'token_id' => $parent->token_id, 'action' => $tool['action'], 'payload' => $prepared]);
        if (in_array(explode('.', $tool['action'])[0], config('platform.service_names'), true)) {
            abort_unless(! isset($conversation->draft['delegated_operation_id'])
                || Operation::findOrFail($conversation->draft['delegated_operation_id'])->parent_operation_id === $parent->id,
                409, 'This preview already has a pending confirmation.');
            $child = Operation::firstOrCreate(['parent_operation_id' => $parent->id], [
                ...$child->getAttributes(), 'payload' => [...$prepared, 'conversation_id' => $conversation->public_id],
                'public_id' => (string) Str::uuid(), 'scope' => 'assistant:'.$parent->id,
                'idempotency_key' => $parent->idempotency_key, 'payload_hash' => hash('sha256', json_encode($prepared, JSON_THROW_ON_ERROR)),
                'receipt_hash' => $parent->receipt_hash, 'status' => Operation::Delegated, 'available_at' => now()]);
            $conversation->draft = [...$conversation->draft, 'delegated_operation_id' => $child->id];
            $conversation->save();
        } else {
            $child->id = $parent->id;
        }
        $result = app(PlatformActionExecutor::class)->execute($child);
        if (($result['_remote_pending'] ?? false) === true) {
            return $result;
        }
        if (isset($result['_remote_completion'])) {
            $completion = $result['_remote_completion'];
            $child->update(['status' => $completion['status'], 'http_status' => $completion['http_status'], 'result' => $completion['result']]);
            $result = $completion['result'];
        }
        $response = ['conversation_id' => $conversation->public_id, 'conversation_version' => $conversation->version,
            'status' => Conversation::Complete, 'message' => isset($completion) && $completion['status'] !== Operation::Succeeded ? 'The service rejected the action.' : 'The platform action completed.', 'executed_action' => $tool['action'],
            'available_actions' => [app(PlatformToolRegistry::class)->describe($tool)], 'required_input' => [], 'api_result' => $result];
        $conversation->status = Conversation::Complete;
        $conversation->draft = ['prepared' => $prepared, ...($child->exists && $child->parent_operation_id !== null ? ['delegated_operation_id' => $child->id] : [])];
        $conversation->result = $response;
        $conversation->save();

        return isset($completion) ? ['_remote_completion' => [...$completion, 'result' => $response]] : $response;
    }
}
