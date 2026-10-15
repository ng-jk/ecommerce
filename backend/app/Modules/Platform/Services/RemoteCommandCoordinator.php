<?php

namespace App\Modules\Platform\Services;

use App\Models\Operation;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\RemoteCommand;
use App\Modules\Platform\OrganizationAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

class RemoteCommandCoordinator
{
    public function execute(Operation $operation, PlatformUser $actor): array
    {
        $this->requireTransaction();
        $this->authorizeIdentity($operation, $actor);
        $organizationId = (int) ($operation->payload['organization_id'] ?? 0);
        $service = explode('.', $operation->action)[0];
        $this->authorize($actor, $organizationId, $service, $operation->action);
        $subject = $this->subject($operation->action, $operation->payload['input']);
        abort_unless($this->subjectAllowed($operation->action, $organizationId, $subject), 403);
        abort_unless($operation->token_id !== null && $operation->exists, 403);
        $remote = RemoteCommand::where('operation_id', $operation->id)->lockForUpdate()->first();
        if ($remote) {
            abort_unless($remote->organization_id === $organizationId && $remote->service === $service && $remote->action === $operation->action, 409);
        }
        if (! $remote) {
            $remote = RemoteCommand::create(['operation_id' => $operation->id, 'command_id' => (string) Str::uuid(),
                'organization_id' => $organizationId, 'service' => $service, 'action' => $operation->action,
                'deadline_at' => now()->addMinutes(5)]);
            $command = ['operation_id' => $operation->public_id, 'input' => $operation->payload['input']];
            if ($operation->payload['id'] ?? null) {
                $command['id'] = (int) $operation->payload['id'];
            }
            app(ServiceExchange::class)->enqueue(['id' => $remote->command_id, 'source' => 'platform', 'destination' => $service,
                'topic' => $service.'.command', 'version' => 1, 'payload' => [
                    'scope' => ['platform_user_id' => $actor->id, 'organization_id' => $organizationId,
                        'application' => $service, 'action' => $operation->action,
                        'auth_version' => $operation->auth_version, 'token_id' => $operation->token_id,
                        ...($subject === null ? [] : ['subject_platform_user_id' => $subject])],
                    'command' => $command]]);
        }
        if ($remote->status === RemoteCommand::Waiting && $remote->deadline_at->isPast()) {
            $remote->update(['status' => RemoteCommand::Rejected, 'http_status' => 504,
                'result' => ['message' => 'Service processing deadline expired. Check reconciliation before creating a new request.']]);
        }

        return $remote->status === RemoteCommand::Waiting ? ['_remote_pending' => true]
            : ['_remote_completion' => ['status' => $remote->status, 'http_status' => $remote->http_status, 'result' => $remote->result]];
    }

    public function acceptResult(array $message): void
    {
        $this->requireTransaction();
        $input = Validator::make($message, [
            'id' => 'required|uuid', 'source' => 'required|string|max:80', 'destination' => 'required|in:platform',
            'topic' => 'required|string|max:100', 'version' => 'required|integer:strict|in:1',
            'payload' => 'required|array:operation_id,command_id,organization_id,action,http_status,result',
            'payload.operation_id' => 'required|uuid', 'payload.command_id' => 'required|uuid',
            'payload.organization_id' => 'required|integer:strict|min:1', 'payload.action' => 'required|string|max:100',
            'payload.http_status' => 'required|integer:strict|in:200,201,400,401,403,404,409,410,422,429',
            'payload.result' => 'required|array',
        ])->validate();
        $payload = $input['payload'];
        $reference = RemoteCommand::where('command_id', $payload['command_id'])->firstOrFail();
        $operation = Operation::findOrFail($reference->operation_id);
        if ($operation->parent_operation_id) {
            Operation::whereKey($operation->parent_operation_id)->lockForUpdate()->firstOrFail();
        }
        $operation = Operation::whereKey($operation->id)->lockForUpdate()->firstOrFail();
        $actor = PlatformUser::whereKey($operation->platform_user_id)->lockForUpdate()->firstOrFail();
        $this->authorizeIdentity($operation, $actor);
        $this->authorize($actor, $reference->organization_id, $reference->service, $reference->action);
        $remote = RemoteCommand::whereKey($reference->id)->lockForUpdate()->firstOrFail();
        abort_unless($input['source'] === $remote->service && $input['topic'] === $remote->service.'.result'
            && $input['id'] === $remote->command_id && $payload['operation_id'] === $operation->public_id
            && $payload['organization_id'] === $remote->organization_id && $payload['action'] === $remote->action, 403);
        $digest = hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
        if ($remote->status !== RemoteCommand::Waiting) {
            abort_unless($remote->response_digest !== null && hash_equals($remote->response_digest, $digest), 409);

            return;
        }
        abort_if($remote->deadline_at->isPast(), 409, 'Late service result requires reconciliation.');
        $remote->update(['status' => in_array($payload['http_status'], [200, 201], true) ? RemoteCommand::Succeeded : RemoteCommand::Rejected,
            'http_status' => $payload['http_status'], 'result' => $payload['result'], 'response_digest' => $digest]);
        $operation->update(['available_at' => now()]);
        if ($operation->parent_operation_id) {
            Operation::whereKey($operation->parent_operation_id)->update(['available_at' => now()]);
        }
    }

    public function authorize(PlatformUser $actor, int $organizationId, string $service, string $action): void
    {
        $this->requireTransaction();
        Organization::whereKey($organizationId)->lockForUpdate()->firstOrFail();
        OrganizationMembership::where('organization_id', $organizationId)->where('platform_user_id', $actor->id)->lockForUpdate()->first();
        OrganizationApplication::where('organization_id', $organizationId)->where('application_key', $service)->lockForUpdate()->first();
        $role = config('platform.service_permissions', [])[$action] ?? null;
        abort_unless(in_array($service, config('platform.service_names'), true) && str_starts_with($action, $service.'.')
            && in_array($role, ['member', 'admin', 'owner'], true), 403);
        abort_unless((config('platform.actions', [])[$action] ?? false) === true, 403);
        app(OrganizationAccess::class)->enforce($actor, $organizationId, $service, $role);
        abort_unless((config('platform.applications', [])[$service]['provisioned'] ?? false) === true, 503);
    }

    public function consumeResult(?string $source = null): bool
    {
        return app(ServiceExchange::class)->consume('platform',
            fn (array $message): bool => in_array($message['source'], config('platform.service_names'), true) && $message['topic'] === $message['source'].'.result',
            fn (array $message) => $this->acceptResult($message), $source);
    }

    private function subject(string $action, array $input): ?int
    {
        $field = match ($action) {
            'crm.deals.create', 'crm.deals.update' => 'assignee_platform_user_id',
            'helpdesk.agents.assign' => 'target_platform_user_id',
            'helpdesk.tickets.owner.assign' => 'assigned_platform_user_id',
            'hr.employees.create' => 'linked_platform_user_id',
            default => null,
        };
        $subject = $field === null ? null : ($input[$field] ?? null);
        abort_unless($subject === null || is_int($subject) && $subject > 0, 422);
        abort_if(in_array($action, ['helpdesk.agents.assign', 'helpdesk.tickets.owner.assign', 'hr.employees.create'], true) && $subject === null, 422);

        return $subject;
    }

    public function subjectAllowed(string $action, int $organizationId, ?int $subject): bool
    {
        if ($subject === null) {
            return ! in_array($action, ['helpdesk.agents.assign', 'helpdesk.tickets.owner.assign', 'hr.employees.create'], true);
        }

        return in_array($action, ['crm.deals.create', 'crm.deals.update', 'helpdesk.agents.assign', 'helpdesk.tickets.owner.assign', 'hr.employees.create'], true)
            && PlatformUser::whereKey($subject)->where('account_status', PlatformUser::Active)->exists()
            && OrganizationMembership::where('organization_id', $organizationId)->where('platform_user_id', $subject)
                ->whereNull('user_id')->where('status', OrganizationMembership::Active)->exists();
    }

    private function authorizeIdentity(Operation $operation, PlatformUser $actor): void
    {
        abort_unless($operation->platform_user_id === $actor->id && $actor->account_status === PlatformUser::Active
            && $actor->auth_version === $operation->auth_version, 403);
        $token = PersonalAccessToken::find($operation->token_id);
        abort_unless($token && $token->tokenable_type === $actor->getMorphClass() && $token->tokenable_id === $actor->id
            && $token->can('platform') && (! $token->expires_at || $token->expires_at->isFuture()), 401);
    }

    private function requireTransaction(): void
    {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException('Remote command coordination requires its local transaction.');
        }
    }
}
