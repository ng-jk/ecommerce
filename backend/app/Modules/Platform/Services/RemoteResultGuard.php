<?php

namespace App\Modules\Platform\Services;

use App\Models\Operation;
use App\Models\PlatformConversation;
use App\Models\RemoteCommand;
use App\Models\ServiceDelivery;
use Illuminate\Support\Facades\DB;

class RemoteResultGuard
{
    /** The private receipt and central identity are checked by the caller before and after this snapshot. */
    public function authorize(Operation $operation): void
    {
        $result = $operation->result;
        $action = $operation->action === 'platform.assistant' ? ($result['executed_action'] ?? '') : $operation->action;
        $service = explode('.', $action)[0];
        if (! in_array($service, config('platform.service_names'), true)) {
            return;
        }
        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Remote result checks cannot hold business locks during network calls.');
        }
        if ($operation->action === 'platform.assistant') {
            $conversation = PlatformConversation::where('public_id', $result['conversation_id'] ?? null)
                ->where('platform_user_id', $operation->platform_user_id)->firstOrFail();
            $child = Operation::findOrFail($conversation->draft['delegated_operation_id'] ?? null);
            abort_unless($child->platform_user_id === $operation->platform_user_id && $child->auth_version === $operation->auth_version
                && $child->action === $action && $child->payload['conversation_id'] === $conversation->public_id
                && $child->parent_operation_id !== null && $child->status === Operation::Succeeded
                && hash_equals($child->receipt_hash, $operation->receipt_hash)
                && $child->token_id === $operation->token_id
                && ServiceResultAuthority::digest($child->result) === ServiceResultAuthority::digest($result['api_result']), 403);
            $operation = $child;
            $result = $result['api_result'];
        }
        $remote = RemoteCommand::where('operation_id', $operation->id)->where('status', RemoteCommand::Succeeded)->firstOrFail();
        $delivery = ServiceDelivery::where('message_id', $remote->command_id)->where('source', 'platform')->where('destination', $service)->firstOrFail();
        $message = json_decode($delivery->envelope, true, 32, JSON_THROW_ON_ERROR);
        $scope = $message['payload']['scope'];
        abort_unless($remote->service === $service && $remote->action === $operation->action
            && $remote->organization_id === (int) $operation->payload['organization_id']
            && $message['payload']['command']['operation_id'] === $operation->public_id
            && $scope['platform_user_id'] === $operation->platform_user_id && $scope['auth_version'] === $operation->auth_version
            && $scope['token_id'] === $operation->token_id && $scope['organization_id'] === $remote->organization_id
            && $scope['action'] === $operation->action && $scope['application'] === $service
            && ServiceResultAuthority::digest($remote->result) === ServiceResultAuthority::digest($result), 403);
        $peer = config('service_exchange.peers.'.$service, []);
        try {
            $transport = new ServiceTransport($peer['url'] ?? '', $peer['key'] ?? '', 'platform', $service);
            $allowed = $transport->authorizeResult(['command_id' => $remote->command_id, 'operation_id' => $operation->public_id,
                'scope' => $scope, 'result_digest' => ServiceResultAuthority::digest($result)]);
        } catch (\Throwable) {
            $allowed = false;
        }
        abort_unless($allowed, 403, 'Current service access to this stored result is unavailable.');
    }
}
