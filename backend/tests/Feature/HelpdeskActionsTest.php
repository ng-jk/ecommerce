<?php

namespace Tests\Feature;

use App\Modules\Helpdesk\AuthorizedHelpdeskScope;
use App\Modules\Helpdesk\HelpdeskActions;
use App\Modules\Helpdesk\Models\HelpdeskQueue;
use App\Modules\Helpdesk\Models\HelpdeskQueueAgent;
use App\Modules\Helpdesk\Models\HelpdeskTicket;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use LogicException;
use PHPUnit\Framework\Attributes\Group;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class HelpdeskActionsTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/helpdesk', '--force' => true]);
    }

    private function envelope(string $action, array $input = [], int $organizationId = 7,
        int $actorId = 11, ?int $subjectId = null): array
    {
        $scope = ['platform_user_id' => $actorId, 'organization_id' => $organizationId,
            'application' => 'helpdesk', 'action' => $action, 'auth_version' => 0, 'token_id' => 43];
        if ($subjectId !== null) {
            $scope['subject_platform_user_id'] = $subjectId;
        }

        return ['id' => 'e37a3e1e-62df-4b13-bbbf-fc0963f5c189', 'source' => 'platform',
            'destination' => 'helpdesk', 'topic' => 'helpdesk.command', 'version' => 1,
            'payload' => ['scope' => $scope, 'command' => ['input' => $input,
                'operation_id' => '3b630bea-44aa-4567-91c7-d61d70161802']]];
    }

    private function runAction(string $action, array $input = [], ?int $id = null,
        int $organizationId = 7, int $actorId = 11, ?int $subjectId = null): array
    {
        $scope = AuthorizedHelpdeskScope::fromVerifiedExchange(
            $this->envelope($action, $input, $organizationId, $actorId, $subjectId), fn () => true);

        return DB::transaction(fn (): array => app(HelpdeskActions::class)->execute($scope, $input, $id));
    }

    private function rejects(callable $effect, string $type): void
    {
        try {
            $effect();
            $this->fail('Request unexpectedly succeeded.');
        } catch (\Throwable $error) {
            $this->assertInstanceOf($type, $error);
        }
    }

    public function test_scope_requires_exact_envelope_and_current_target_binding(): void
    {
        $scope = AuthorizedHelpdeskScope::fromVerifiedExchange($this->envelope('helpdesk.queues.list'), fn () => true);
        $this->assertSame([7, 11, 'helpdesk.queues.list', null],
            [$scope->organizationId, $scope->platformUserId, $scope->action, $scope->subjectPlatformUserId]);
        $this->assertNull(AuthorizedHelpdeskScope::fromVerifiedExchange($this->envelope('helpdesk.queues.list'), fn () => false));
        foreach (['helpdesk.agents.assign' => 'target_platform_user_id',
            'helpdesk.tickets.owner.assign' => 'assigned_platform_user_id'] as $action => $field) {
            $valid = $this->envelope($action, [$field => 12], 7, 11, 12);
            $this->assertSame(12, AuthorizedHelpdeskScope::fromVerifiedExchange($valid, fn () => true)->subjectPlatformUserId);
            $invalid = $this->envelope($action, [$field => 13], 7, 11, 12);
            $this->rejects(fn () => AuthorizedHelpdeskScope::fromVerifiedExchange($invalid, fn () => true), InvalidArgumentException::class);
            $missing = $this->envelope($action, [$field => 12]);
            $this->rejects(fn () => AuthorizedHelpdeskScope::fromVerifiedExchange($missing, fn () => true), InvalidArgumentException::class);
        }
        foreach (['source' => 'browser', 'destination' => 'crm', 'topic' => 'crm.command',
            'version' => 2, 'id' => 'bad'] as $field => $value) {
            $invalid = $this->envelope('helpdesk.queues.list');
            $invalid[$field] = $value;
            $this->rejects(fn () => AuthorizedHelpdeskScope::fromVerifiedExchange($invalid, fn () => true), InvalidArgumentException::class);
        }
        foreach (['application' => 'crm', 'organization_id' => 0, 'auth_version' => -1,
            'action' => 'helpdesk.fake.action'] as $field => $value) {
            $invalid = $this->envelope('helpdesk.queues.list');
            $invalid['payload']['scope'][$field] = $value;
            $this->rejects(fn () => AuthorizedHelpdeskScope::fromVerifiedExchange($invalid, fn () => true), InvalidArgumentException::class);
        }
        $invalid = $this->envelope('helpdesk.queues.list');
        $invalid['payload']['command']['id'] = '1';
        $this->rejects(fn () => AuthorizedHelpdeskScope::fromVerifiedExchange($invalid, fn () => true), InvalidArgumentException::class);
        $invalid = $this->envelope('helpdesk.queues.list');
        $invalid['payload']['extra'] = true;
        $this->rejects(fn () => AuthorizedHelpdeskScope::fromVerifiedExchange($invalid, fn () => true), InvalidArgumentException::class);
        $this->rejects(fn () => AuthorizedHelpdeskScope::fromVerifiedExchange(
            $this->envelope('helpdesk.queues.list'), fn () => 'yes'), LogicException::class);
    }

    public function test_queues_roster_and_tickets_enforce_visibility_versions_and_transitions(): void
    {
        $queue = $this->runAction('helpdesk.queues.create', ['code' => 'general', 'name' => ' General '])['queue'];
        $otherQueue = $this->runAction('helpdesk.queues.create', ['code' => 'billing', 'name' => 'Billing'])['queue'];
        $this->runAction('helpdesk.queues.create', ['code' => 'general', 'name' => 'Other tenant'], null, 8);
        $this->assertSame('General', $queue['name']);
        $this->assertSame([$otherQueue['id']], array_column($this->runAction('helpdesk.queues.list',
            ['page' => '2', 'per_page' => '1'])['data'], 'id'));
        $this->assertSame(2, $this->runAction('helpdesk.queues.list', ['status' => 'active'])['meta']['total']);
        $this->assertSame($queue, $this->runAction('helpdesk.queues.detail', [], $queue['id'])['queue']);
        $this->rejects(fn () => $this->runAction('helpdesk.queues.detail', [], $queue['id'], 8), ModelNotFoundException::class);
        $this->rejects(fn () => $this->runAction('helpdesk.queues.create', ['code' => 'general', 'name' => 'Duplicate']), ValidationException::class);
        $this->rejects(fn () => $this->runAction('helpdesk.queues.update',
            ['name' => 'New', 'status' => 'active', 'expected_version' => 1], $queue['id']), HttpException::class);

        $agent = $this->runAction('helpdesk.agents.assign',
            ['queue_id' => $queue['id'], 'target_platform_user_id' => 12], null, 7, 11, 12)['agent'];
        $this->assertSame(12, $agent['platform_user_id']);
        $this->assertSame([$agent['id']], array_column($this->runAction('helpdesk.agents.list',
            ['queue_id' => (string) $queue['id'], 'status' => 'active'])['data'], 'id'));
        $ticket = $this->runAction('helpdesk.tickets.requester.create',
            ['queue_id' => $queue['id'], 'subject' => ' First ', 'description' => ' Need help '])['ticket'];
        $this->assertSame('First', $ticket['subject']);
        $this->assertArrayNotHasKey('requester_platform_user_id', $ticket);
        $this->assertSame([$ticket['id']], array_column($this->runAction('helpdesk.tickets.requester.list')['data'], 'id'));
        $this->assertSame(0, $this->runAction('helpdesk.tickets.requester.list', [], null, 7, 13)['meta']['total']);
        $this->assertSame(1, $this->runAction('helpdesk.tickets.agent.list', [], null, 7, 12)['meta']['total']);
        $this->assertSame(0, $this->runAction('helpdesk.tickets.agent.list', [], null, 7, 13)['meta']['total']);
        $this->assertSame(1, $this->runAction('helpdesk.tickets.owner.list', ['status' => 'open'])['meta']['total']);
        $this->assertSame(1, $this->runAction('helpdesk.tickets.owner.list', ['queue_id' => (string) $queue['id']])['meta']['total']);
        $this->rejects(fn () => $this->runAction('helpdesk.tickets.requester.detail', [], $ticket['id'], 7, 13), ModelNotFoundException::class);
        $this->rejects(fn () => $this->runAction('helpdesk.tickets.agent.detail', [], $ticket['id'], 7, 13), ModelNotFoundException::class);
        $this->assertSame($ticket['id'], $this->runAction('helpdesk.tickets.owner.detail', [], $ticket['id'])['ticket']['id']);
        $this->assertSame($ticket['id'], $this->runAction('helpdesk.tickets.agent.detail', [], $ticket['id'], 7, 12)['ticket']['id']);

        $assigned = $this->runAction('helpdesk.tickets.owner.assign',
            ['assigned_platform_user_id' => 12, 'expected_version' => 0], $ticket['id'], 7, 11, 12)['ticket'];
        $this->assertSame(1, $assigned['version']);
        $this->rejects(fn () => $this->runAction('helpdesk.tickets.owner.assign',
            ['assigned_platform_user_id' => 12, 'expected_version' => 0], $ticket['id'], 7, 11, 12), HttpException::class);
        $pending = $this->runAction('helpdesk.tickets.agent.status',
            ['status' => 'pending', 'expected_version' => 1], $ticket['id'], 7, 12)['ticket'];
        $this->assertSame('pending', $pending['status']);
        $resolved = $this->runAction('helpdesk.tickets.owner.status',
            ['status' => 'resolved', 'expected_version' => 2], $ticket['id'])['ticket'];
        $this->assertSame(3, $resolved['version']);
        $closed = $this->runAction('helpdesk.tickets.owner.status',
            ['status' => 'closed', 'expected_version' => 3], $ticket['id'])['ticket'];
        $this->assertSame('closed', $closed['status']);
        $this->rejects(fn () => $this->runAction('helpdesk.tickets.owner.status',
            ['status' => 'open', 'expected_version' => 4], $ticket['id']), HttpException::class);
        $this->assertSame('closed', HelpdeskTicket::find($ticket['id'])->status);

        $revoked = $this->runAction('helpdesk.agents.revoke', ['expected_version' => 0], $agent['id'])['agent'];
        $this->assertSame('revoked', $revoked['status']);
        $this->assertSame(0, $this->runAction('helpdesk.tickets.agent.list', [], null, 7, 12)['meta']['total']);
        $reactivated = $this->runAction('helpdesk.agents.assign',
            ['queue_id' => $queue['id'], 'target_platform_user_id' => 12, 'expected_version' => 1], null, 7, 11, 12)['agent'];
        $this->assertSame(2, $reactivated['version']);
        $disabled = $this->runAction('helpdesk.queues.update',
            ['name' => 'General', 'status' => 'disabled', 'expected_version' => 0], $queue['id'])['queue'];
        $this->assertSame('disabled', $disabled['status']);
        $this->assertSame(0, $this->runAction('helpdesk.tickets.agent.list', [], null, 7, 12)['meta']['total']);
        $this->rejects(fn () => $this->runAction('helpdesk.tickets.requester.create',
            ['queue_id' => $queue['id'], 'subject' => 'No', 'description' => 'Disabled']), HttpException::class);
        $this->assertSame(1, $this->runAction('helpdesk.tickets.requester.list')['meta']['total']);
    }

    public function test_strict_input_and_cross_organization_constraints(): void
    {
        $queue = $this->runAction('helpdesk.queues.create', ['code' => 'general', 'name' => 'General'])['queue'];
        $other = $this->runAction('helpdesk.queues.create', ['code' => 'other', 'name' => 'Other'], null, 8)['queue'];
        foreach ([['helpdesk.queues.list', ['per_page' => 51]],
            ['helpdesk.queues.list', ['page' => '01']],
            ['helpdesk.queues.list', ['page' => '1e2']],
            ['helpdesk.queues.list', ['page' => '999999999999999999999999999999']],
            ['helpdesk.agents.list', ['queue_id' => '01']],
            ['helpdesk.tickets.owner.list', ['queue_id' => '999999999999999999999999999999']],
            ['helpdesk.queues.create', ['code' => 'bad', 'name' => 'Bad', 'organization_id' => 8]],
            ['helpdesk.tickets.requester.create', ['queue_id' => $queue['id'], 'subject' => 'A', 'description' => 'B', 'status' => 'closed']]] as [$action, $input]) {
            $this->rejects(fn () => $this->runAction($action, $input), ValidationException::class);
        }
        $this->rejects(fn () => $this->runAction('helpdesk.agents.assign',
            ['queue_id' => $queue['id'], 'target_platform_user_id' => 12, 'expected_version' => 0], null, 7, 11, 12), HttpException::class);
        $this->rejects(fn () => $this->runAction('helpdesk.agents.assign',
            ['queue_id' => (string) $queue['id'], 'target_platform_user_id' => 12], null, 7, 11, 12), ValidationException::class);
        $this->rejects(fn () => $this->runAction('helpdesk.agents.assign',
            ['queue_id' => $other['id'], 'target_platform_user_id' => 12], null, 7, 11, 12), ModelNotFoundException::class);
        $this->rejects(fn () => $this->runAction('helpdesk.tickets.requester.create',
            ['queue_id' => $other['id'], 'subject' => 'No', 'description' => 'Other tenant']), ModelNotFoundException::class);
        $this->rejects(fn () => $this->runAction('helpdesk.queues.detail', ['unknown' => true], $queue['id']), ValidationException::class);
        $this->rejects(fn () => $this->runAction('helpdesk.queues.list', [], 1), HttpException::class);
        $this->assertSame(2, DB::table('helpdesk_queues')->count());
        $this->assertSame(['active' => 'Active', 'disabled' => 'Disabled'], HelpdeskQueue::options());
        $this->assertSame(['active' => 'Active', 'revoked' => 'Revoked'], HelpdeskQueueAgent::options());
        $this->assertSame(['open' => 'Open', 'pending' => 'Pending', 'resolved' => 'Resolved', 'closed' => 'Closed'], HelpdeskTicket::options());
    }

    public function test_actions_require_fenced_transaction_and_unique_roster_conflicts_return_validation(): void
    {
        $scope = AuthorizedHelpdeskScope::fromVerifiedExchange($this->envelope('helpdesk.queues.list'), fn () => true);
        $this->rejects(fn () => app(HelpdeskActions::class)->execute($scope, []), LogicException::class);
        $queue = $this->runAction('helpdesk.queues.create', ['code' => 'general', 'name' => 'General'])['queue'];
        $this->runAction('helpdesk.agents.assign',
            ['queue_id' => $queue['id'], 'target_platform_user_id' => 12], null, 7, 11, 12);
        $this->rejects(fn () => $this->runAction('helpdesk.agents.assign',
            ['queue_id' => $queue['id'], 'target_platform_user_id' => 12], null, 7, 11, 12), HttpException::class);
    }

    public function test_concurrent_roster_insert_maps_unique_conflict_but_preserves_unrelated_database_errors(): void
    {
        $queue = $this->runAction('helpdesk.queues.create', ['code' => 'general', 'name' => 'General'])['queue'];
        HelpdeskQueueAgent::creating(function (HelpdeskQueueAgent $agent): void {
            DB::table('helpdesk_queue_agents')->insert([
                'organization_id' => $agent->organization_id, 'queue_id' => $agent->queue_id,
                'platform_user_id' => $agent->platform_user_id, 'status' => 'active',
                'version' => 0, 'created_at' => now(), 'updated_at' => now(),
            ]);
        });
        $this->rejects(fn () => $this->runAction('helpdesk.agents.assign',
            ['queue_id' => $queue['id'], 'target_platform_user_id' => 12], null, 7, 11, 12), ValidationException::class);
        HelpdeskQueueAgent::flushEventListeners();
        HelpdeskQueue::creating(fn () => DB::statement('SELECT * FROM helpdesk_missing_table'));
        $this->rejects(fn () => $this->runAction('helpdesk.queues.create',
            ['code' => 'other', 'name' => 'Other']), QueryException::class);
        HelpdeskQueue::flushEventListeners();
    }

    public function test_stored_ticket_results_recheck_local_visibility_and_target_binding(): void
    {
        $queue = HelpdeskQueue::create(['organization_id' => 7, 'code' => 'general', 'name' => 'General']);
        $agent = HelpdeskQueueAgent::create(['organization_id' => 7, 'queue_id' => $queue->id, 'platform_user_id' => 12]);
        $ticket = HelpdeskTicket::create(['organization_id' => 7, 'queue_id' => $queue->id, 'requester_platform_user_id' => 11, 'subject' => 'Help', 'description' => 'Private']);
        $scope = AuthorizedHelpdeskScope::fromVerifiedExchange($this->envelope('helpdesk.tickets.agent.detail', [], 7, 12), fn () => true);
        $check = fn (array $result, array $command = []) => DB::transaction(fn () => app(HelpdeskActions::class)->authorizeResult($scope, $command, $result));
        $result = ['ticket' => ['id' => $ticket->id]];
        $this->assertTrue($check($result, ['id' => $ticket->id]));
        $this->assertFalse($check($result, ['id' => $ticket->id + 1]));
        $this->assertFalse($check(['ticket' => ['id' => (string) $ticket->id]]));
        $this->assertFalse($check([]));
        $agent->update(['status' => HelpdeskQueueAgent::Revoked]);
        $this->assertFalse($check($result));
        $agent->update(['status' => HelpdeskQueueAgent::Active]);
        $queue->update(['status' => HelpdeskQueue::Disabled]);
        $this->assertFalse($check($result));
        $queue->update(['status' => HelpdeskQueue::Active]);
        $ticket->delete();
        $this->assertFalse($check($result));
        $this->rejects(fn () => app(HelpdeskActions::class)->authorizeResult($scope, [], $result), LogicException::class);
    }

    #[Group('postgresql')]
    public function test_status_rechecks_revocation_after_read_and_locks_authority_until_commit(): void
    {
        $this->assertSame('pgsql', DB::getDriverName());
        config(['database.connections.helpdesk_peer' => config('database.connections.pgsql')]);
        $peer = DB::connection('helpdesk_peer');
        $peer->statement("SET lock_timeout = '150ms'");
        $queue = HelpdeskQueue::create(['organization_id' => 7, 'code' => 'general', 'name' => 'General']);
        $agent = HelpdeskQueueAgent::create(['organization_id' => 7, 'queue_id' => $queue->id, 'platform_user_id' => 12]);
        $ticket = HelpdeskTicket::create(['organization_id' => 7, 'queue_id' => $queue->id, 'requester_platform_user_id' => 11, 'subject' => 'Help', 'description' => 'Private']);
        try {
            foreach ([['helpdesk_queue_agents', $agent->id, 'revoked'], ['helpdesk_queues', $queue->id, 'disabled']] as [$table, $id, $status]) {
                $interleaved = false;
                HelpdeskTicket::retrieved(function () use (&$interleaved, $peer, $table, $id, $status): void {
                    if (! $interleaved) {
                        $interleaved = true;
                        $peer->table($table)->where('id', $id)->update(['status' => $status]);
                    }
                });
                $this->rejects(fn () => $this->runAction('helpdesk.tickets.agent.status',
                    ['status' => 'pending', 'expected_version' => 0], $ticket->id, 7, 12), HttpException::class);
                HelpdeskTicket::flushEventListeners();
                $this->assertTrue($interleaved);
                $this->assertSame('open', $ticket->fresh()->status);
                $peer->table($table)->where('id', $id)->update(['status' => 'active']);
            }
            $blocked = 0;
            HelpdeskTicket::updating(function () use ($peer, $queue, $agent, &$blocked): void {
                foreach ([['helpdesk_queue_agents', $agent->id, 'revoked'], ['helpdesk_queues', $queue->id, 'disabled']] as [$table, $id, $status]) {
                    try {
                        $peer->table($table)->where('id', $id)->update(['status' => $status]);
                        $this->fail('Revocation committed while an authorized mutation was in progress.');
                    } catch (QueryException $error) {
                        $this->assertSame('55P03', $error->getCode());
                        $blocked++;
                    }
                }
            });
            $result = $this->runAction('helpdesk.tickets.agent.status', ['status' => 'pending', 'expected_version' => 0], $ticket->id, 7, 12);
            $this->assertSame('pending', $result['ticket']['status']);
            $this->assertSame(2, $blocked);
        } finally {
            HelpdeskTicket::flushEventListeners();
            DB::purge('helpdesk_peer');
        }
    }
}
