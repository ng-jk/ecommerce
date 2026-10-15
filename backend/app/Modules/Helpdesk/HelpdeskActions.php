<?php

namespace App\Modules\Helpdesk;

use App\Modules\Helpdesk\Models\HelpdeskQueue;
use App\Modules\Helpdesk\Models\HelpdeskQueueAgent;
use App\Modules\Helpdesk\Models\HelpdeskTicket;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use LogicException;

final class HelpdeskActions
{
    private const ListActions = ['helpdesk.queues.list', 'helpdesk.agents.list',
        'helpdesk.tickets.requester.list', 'helpdesk.tickets.agent.list', 'helpdesk.tickets.owner.list'];

    private const CreateActions = ['helpdesk.queues.create', 'helpdesk.agents.assign', 'helpdesk.tickets.requester.create'];

    /** Recheck stored result visibility without repeating the original business action. */
    public function authorizeResult(AuthorizedHelpdeskScope $scope, array $command, array $result): bool
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Helpdesk result authorization requires a local transaction.');
        }
        $kind = explode('.', $scope->action)[1];
        [$class, $field] = match ($kind) {
            'tickets' => [HelpdeskTicket::class, 'ticket'],
            'queues' => [HelpdeskQueue::class, 'queue'],
            'agents' => [HelpdeskQueueAgent::class, 'agent'],
        };
        $list = str_ends_with($scope->action, '.list');
        $records = $list ? ($result['data'] ?? null) : (isset($result[$field]) ? [$result[$field]] : null);
        if (! is_array($records) || ! array_is_list($records) || count($records) > 50) {
            return false;
        }
        $ids = [];
        foreach ($records as $record) {
            if (! is_array($record) || ! is_int($record['id'] ?? null) || $record['id'] < 1) {
                return false;
            }
            $ids[] = $record['id'];
        }
        if (count(array_unique($ids)) !== count($ids)
            || (! $list && isset($command['id']) && $ids !== [$command['id']])) {
            return false;
        }
        $query = $class::where('organization_id', $scope->organizationId)->whereIn('id', $ids);
        if ($kind === 'tickets') {
            $this->visibility($query, $scope, explode('.', $scope->action)[2]);
        }

        return $query->count() === count($ids);
    }

    public function execute(AuthorizedHelpdeskScope $scope, array $input, ?int $id = null): array
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Helpdesk actions require a fenced inbox transaction.');
        }
        abort_if($id !== null && $id < 1, 404);
        abort_if($id !== null && in_array($scope->action, [...self::ListActions, ...self::CreateActions], true), 422);

        return match ($scope->action) {
            'helpdesk.queues.list' => $this->queues($scope, $input),
            'helpdesk.queues.create' => $this->createQueue($scope, $input),
            'helpdesk.queues.detail' => $this->queue($scope, $this->requiredId($id), $input),
            'helpdesk.queues.update' => $this->updateQueue($scope, $this->requiredId($id), $input),
            'helpdesk.agents.list' => $this->agents($scope, $input),
            'helpdesk.agents.assign' => $this->assignAgent($scope, $input),
            'helpdesk.agents.revoke' => $this->revokeAgent($scope, $this->requiredId($id), $input),
            'helpdesk.tickets.requester.list' => $this->tickets($scope, $input, 'requester'),
            'helpdesk.tickets.requester.create' => $this->createTicket($scope, $input),
            'helpdesk.tickets.requester.detail' => $this->ticket($scope, $this->requiredId($id), $input, 'requester'),
            'helpdesk.tickets.agent.list' => $this->tickets($scope, $input, 'agent'),
            'helpdesk.tickets.agent.detail' => $this->ticket($scope, $this->requiredId($id), $input, 'agent'),
            'helpdesk.tickets.agent.status' => $this->changeStatus($scope, $this->requiredId($id), $input, 'agent'),
            'helpdesk.tickets.owner.list' => $this->tickets($scope, $input, 'owner'),
            'helpdesk.tickets.owner.detail' => $this->ticket($scope, $this->requiredId($id), $input, 'owner'),
            'helpdesk.tickets.owner.assign' => $this->assignTicket($scope, $this->requiredId($id), $input),
            'helpdesk.tickets.owner.status' => $this->changeStatus($scope, $this->requiredId($id), $input, 'owner'),
            default => abort(403, 'Helpdesk action is unavailable.'),
        };
    }

    private function queues(AuthorizedHelpdeskScope $scope, array $input): array
    {
        $data = $this->validated($input, ['page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:20',
            'status' => ['sometimes', Rule::in(array_keys(HelpdeskQueue::options()))]], true);
        $query = HelpdeskQueue::where('organization_id', $scope->organizationId);
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20),
            ['id', 'code', 'name', 'status', 'version'], 'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (HelpdeskQueue $queue): array => $this->publicQueue($queue))->all(),
            'meta' => [...$this->meta($page), 'options' => ['status' => HelpdeskQueue::options()]]];
    }

    private function createQueue(AuthorizedHelpdeskScope $scope, array $input): array
    {
        $data = $this->validated($input, ['code' => ['required', 'string', 'min:3', 'max:80', 'regex:/^[a-z][a-z0-9-]*$/D'],
            'name' => 'required|string|min:1|max:160']);
        try {
            $queue = HelpdeskQueue::create(['organization_id' => $scope->organizationId,
                'code' => $data['code'], 'name' => trim($data['name'])]);
        } catch (QueryException $error) {
            $this->uniqueOrThrow($error, 'code');
        }

        return ['queue' => $this->publicQueue($queue), 'options' => ['status' => HelpdeskQueue::options()]];
    }

    private function queue(AuthorizedHelpdeskScope $scope, int $id, array $input): array
    {
        $this->validated($input, []);
        $queue = HelpdeskQueue::where('organization_id', $scope->organizationId)->findOrFail($id);

        return ['queue' => $this->publicQueue($queue), 'options' => ['status' => HelpdeskQueue::options()]];
    }

    private function updateQueue(AuthorizedHelpdeskScope $scope, int $id, array $input): array
    {
        $data = $this->validated($input, ['name' => 'required|string|min:1|max:160',
            'status' => ['required', Rule::in(array_keys(HelpdeskQueue::options()))],
            'expected_version' => 'required|integer:strict|min:0']);
        $queue = HelpdeskQueue::where('organization_id', $scope->organizationId)->lockForUpdate()->findOrFail($id);
        $this->version($queue->version, $data['expected_version']);
        $queue->update(['name' => trim($data['name']), 'status' => $data['status'], 'version' => $queue->version + 1]);

        return ['queue' => $this->publicQueue($queue), 'options' => ['status' => HelpdeskQueue::options()]];
    }

    private function agents(AuthorizedHelpdeskScope $scope, array $input): array
    {
        $data = $this->validated($input, ['page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50', 'queue_id' => 'sometimes|integer:strict|min:1',
            'status' => ['sometimes', Rule::in(array_keys(HelpdeskQueueAgent::options()))]], true);
        $query = HelpdeskQueueAgent::where('organization_id', $scope->organizationId);
        if (isset($data['queue_id'])) {
            $query->where('queue_id', $data['queue_id']);
        }
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20),
            ['id', 'queue_id', 'platform_user_id', 'status', 'version'], 'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (HelpdeskQueueAgent $agent): array => $this->publicAgent($agent))->all(),
            'meta' => [...$this->meta($page), 'options' => ['status' => HelpdeskQueueAgent::options()]]];
    }

    private function assignAgent(AuthorizedHelpdeskScope $scope, array $input): array
    {
        $data = $this->validated($input, ['queue_id' => 'required|integer:strict|min:1',
            'target_platform_user_id' => 'required|integer:strict|min:1',
            'expected_version' => 'sometimes|integer:strict|min:0']);
        abort_unless($scope->subjectPlatformUserId === $data['target_platform_user_id'], 403);
        $this->activeQueue($scope->organizationId, $data['queue_id']);
        $agent = HelpdeskQueueAgent::where('organization_id', $scope->organizationId)
            ->where('queue_id', $data['queue_id'])->where('platform_user_id', $data['target_platform_user_id'])
            ->lockForUpdate()->first();
        if ($agent) {
            abort_unless($agent->status === HelpdeskQueueAgent::Revoked, 409);
            $this->version($agent->version, $data['expected_version'] ?? null);
            $agent->update(['status' => HelpdeskQueueAgent::Active, 'version' => $agent->version + 1]);
        } else {
            abort_if(isset($data['expected_version']), 409);
            try {
                $agent = HelpdeskQueueAgent::create(['organization_id' => $scope->organizationId,
                    'queue_id' => $data['queue_id'], 'platform_user_id' => $data['target_platform_user_id']]);
            } catch (QueryException $error) {
                $this->uniqueOrThrow($error, 'target_platform_user_id');
            }
        }

        return ['agent' => $this->publicAgent($agent), 'options' => ['status' => HelpdeskQueueAgent::options()]];
    }

    private function revokeAgent(AuthorizedHelpdeskScope $scope, int $id, array $input): array
    {
        $data = $this->validated($input, ['expected_version' => 'required|integer:strict|min:0']);
        $agent = HelpdeskQueueAgent::where('organization_id', $scope->organizationId)->lockForUpdate()->findOrFail($id);
        $this->version($agent->version, $data['expected_version']);
        abort_unless($agent->status === HelpdeskQueueAgent::Active, 409);
        $agent->update(['status' => HelpdeskQueueAgent::Revoked, 'version' => $agent->version + 1]);

        return ['agent' => $this->publicAgent($agent), 'options' => ['status' => HelpdeskQueueAgent::options()]];
    }

    private function tickets(AuthorizedHelpdeskScope $scope, array $input, string $mode): array
    {
        $data = $this->validated($input, ['page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:20', 'queue_id' => 'sometimes|integer:strict|min:1',
            'status' => ['sometimes', Rule::in(array_keys(HelpdeskTicket::options()))]], true);
        $query = HelpdeskTicket::where('organization_id', $scope->organizationId);
        $this->visibility($query, $scope, $mode);
        if (isset($data['queue_id'])) {
            $query->where('queue_id', $data['queue_id']);
        }
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20),
            ['id', 'queue_id', 'requester_platform_user_id', 'assigned_platform_user_id', 'subject', 'status', 'version'],
            'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (HelpdeskTicket $ticket): array => $this->publicTicket($ticket, $mode, false))->all(),
            'meta' => [...$this->meta($page), 'options' => ['status' => HelpdeskTicket::options()]]];
    }

    private function createTicket(AuthorizedHelpdeskScope $scope, array $input): array
    {
        $data = $this->validated($input, ['queue_id' => 'required|integer:strict|min:1',
            'subject' => 'required|string|min:1|max:200', 'description' => 'required|string|min:1|max:10000']);
        $this->activeQueue($scope->organizationId, $data['queue_id']);
        $ticket = HelpdeskTicket::create(['organization_id' => $scope->organizationId,
            'queue_id' => $data['queue_id'], 'requester_platform_user_id' => $scope->platformUserId,
            'subject' => trim($data['subject']), 'description' => trim($data['description'])]);

        return ['ticket' => $this->publicTicket($ticket, 'requester'), 'options' => ['status' => HelpdeskTicket::options()]];
    }

    private function ticket(AuthorizedHelpdeskScope $scope, int $id, array $input, string $mode): array
    {
        $this->validated($input, []);
        $query = HelpdeskTicket::where('organization_id', $scope->organizationId);
        $this->visibility($query, $scope, $mode);
        $ticket = $query->findOrFail($id);

        return ['ticket' => $this->publicTicket($ticket, $mode), 'options' => ['status' => HelpdeskTicket::options()]];
    }

    private function assignTicket(AuthorizedHelpdeskScope $scope, int $id, array $input): array
    {
        $data = $this->validated($input, ['assigned_platform_user_id' => 'required|integer:strict|min:1',
            'expected_version' => 'required|integer:strict|min:0']);
        abort_unless($scope->subjectPlatformUserId === $data['assigned_platform_user_id'], 403);
        $reference = HelpdeskTicket::where('organization_id', $scope->organizationId)->findOrFail($id);
        $this->activeAgent($scope->organizationId, $reference->queue_id, $data['assigned_platform_user_id']);
        $ticket = HelpdeskTicket::where('organization_id', $scope->organizationId)
            ->where('queue_id', $reference->queue_id)->lockForUpdate()->findOrFail($id);
        $this->version($ticket->version, $data['expected_version']);
        abort_unless($ticket->status !== HelpdeskTicket::Closed, 409);
        $ticket->update(['assigned_platform_user_id' => $data['assigned_platform_user_id'], 'version' => $ticket->version + 1]);

        return ['ticket' => $this->publicTicket($ticket, 'owner'), 'options' => ['status' => HelpdeskTicket::options()]];
    }

    private function changeStatus(AuthorizedHelpdeskScope $scope, int $id, array $input, string $mode): array
    {
        $data = $this->validated($input, ['status' => ['required', Rule::in(array_keys(HelpdeskTicket::options()))],
            'expected_version' => 'required|integer:strict|min:0']);
        if ($mode === 'agent') {
            $reference = HelpdeskTicket::where('organization_id', $scope->organizationId)->findOrFail($id);
            $this->activeAgent($scope->organizationId, $reference->queue_id, $scope->platformUserId);
        }
        $query = HelpdeskTicket::where('organization_id', $scope->organizationId)->lockForUpdate();
        $this->visibility($query, $scope, $mode);
        $ticket = $query->findOrFail($id);
        $this->version($ticket->version, $data['expected_version']);
        $allowed = [HelpdeskTicket::Open => [HelpdeskTicket::Pending, HelpdeskTicket::Resolved],
            HelpdeskTicket::Pending => [HelpdeskTicket::Open, HelpdeskTicket::Resolved],
            HelpdeskTicket::Resolved => [HelpdeskTicket::Closed], HelpdeskTicket::Closed => []];
        abort_unless(in_array($data['status'], $allowed[$ticket->status] ?? [], true), 409, 'Invalid ticket transition.');
        $ticket->update(['status' => $data['status'], 'version' => $ticket->version + 1]);

        return ['ticket' => $this->publicTicket($ticket, $mode), 'options' => ['status' => HelpdeskTicket::options()]];
    }

    private function visibility(Builder $query, AuthorizedHelpdeskScope $scope, string $mode): void
    {
        if ($mode === 'requester') {
            $query->where('requester_platform_user_id', $scope->platformUserId);
        } elseif ($mode === 'agent') {
            $query->whereExists(function ($subquery) use ($scope): void {
                $subquery->selectRaw('1')->from('helpdesk_queue_agents as agents')
                    ->join('helpdesk_queues as queues', function ($join): void {
                        $join->on('queues.organization_id', '=', 'agents.organization_id')
                            ->on('queues.id', '=', 'agents.queue_id');
                    })
                    ->whereColumn('agents.organization_id', 'helpdesk_tickets.organization_id')
                    ->whereColumn('agents.queue_id', 'helpdesk_tickets.queue_id')
                    ->where('agents.platform_user_id', $scope->platformUserId)
                    ->where('agents.status', HelpdeskQueueAgent::Active)->whereNull('agents.deleted_at')
                    ->where('queues.status', HelpdeskQueue::Active)->whereNull('queues.deleted_at');
            });
        }
    }

    private function activeQueue(int $organizationId, int $queueId): HelpdeskQueue
    {
        $queue = HelpdeskQueue::where('organization_id', $organizationId)->lockForUpdate()->findOrFail($queueId);
        abort_unless($queue->status === HelpdeskQueue::Active, 403);

        return $queue;
    }

    private function activeAgent(int $organizationId, int $queueId, int $userId): void
    {
        $this->activeQueue($organizationId, $queueId);
        abort_unless(HelpdeskQueueAgent::where('organization_id', $organizationId)->where('queue_id', $queueId)
            ->where('platform_user_id', $userId)->where('status', HelpdeskQueueAgent::Active)
            ->lockForUpdate()->first() !== null, 403, 'The selected agent is unavailable.');
    }

    private function requiredId(?int $id): int
    {
        abort_unless($id !== null, 422);

        return $id;
    }

    private function validated(array $input, array $rules, bool $query = false): array
    {
        foreach (array_diff(array_keys($input), array_keys($rules)) as $field) {
            throw ValidationException::withMessages([$field => 'The field is not supported.']);
        }
        if ($query) {
            foreach (['page', 'per_page', 'queue_id'] as $field) {
                if (isset($input[$field]) && is_string($input[$field])
                    && preg_match('/^[1-9][0-9]*$/D', $input[$field])) {
                    $parsed = filter_var($input[$field], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                    if ($parsed !== false) {
                        $input[$field] = $parsed;
                    }
                }
            }
        }

        return Validator::make($input, $rules)->validate();
    }

    private function version(int $actual, ?int $expected): void
    {
        abort_unless($expected !== null && $actual === $expected, 409, 'The record changed. Refresh before retrying.');
    }

    private function uniqueOrThrow(QueryException $error, string $field): never
    {
        if (in_array($error->getCode(), ['23505', '23000', '19'], true)) {
            throw ValidationException::withMessages([$field => 'The value already exists.']);
        }

        throw $error;
    }

    private function publicQueue(HelpdeskQueue $queue): array
    {
        return ['id' => $queue->id, 'code' => $queue->code, 'name' => $queue->name,
            'status' => $queue->status, 'version' => $queue->version];
    }

    private function publicAgent(HelpdeskQueueAgent $agent): array
    {
        return ['id' => $agent->id, 'queue_id' => $agent->queue_id,
            'platform_user_id' => $agent->platform_user_id, 'status' => $agent->status, 'version' => $agent->version];
    }

    private function publicTicket(HelpdeskTicket $ticket, string $mode, bool $detail = true): array
    {
        $result = ['id' => $ticket->id, 'queue_id' => $ticket->queue_id,
            'subject' => $ticket->subject,
            'status' => $ticket->status, 'version' => $ticket->version];
        if ($detail) {
            $result['description'] = $ticket->description;
        }
        if ($mode !== 'requester') {
            $result['requester_platform_user_id'] = $ticket->requester_platform_user_id;
            $result['assigned_platform_user_id'] = $ticket->assigned_platform_user_id;
        }

        return $result;
    }

    private function meta(LengthAwarePaginator $page): array
    {
        return ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
            'total' => $page->total(), 'per_page' => $page->perPage()];
    }
}
