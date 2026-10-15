<?php

namespace Tests\Feature;

use App\Domain\Assistant\ToolRegistry;
use App\Domain\OperationProcessor;
use App\Models\ApplicationEntitlementGrant;
use App\Models\Operation;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\RemoteCommand;
use App\Models\ServiceDelivery;
use App\Modules\Platform\PlatformActionExecutor;
use App\Modules\Platform\PlatformAssistantActions;
use App\Modules\Platform\Services\RemoteCommandCoordinator;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceWorker;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\TestCase;

class RemoteCommandTest extends TestCase
{
    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        config(['platform.actions.crm.companies.create' => true,
            'platform.service_permissions.crm.companies.create' => 'admin',
            'platform.applications.crm' => ['available' => true, 'provisioned' => true]]);
    }

    private function operation(): Operation
    {
        $user = PlatformUser::factory()->create();
        $org = Organization::factory()->create();
        OrganizationMembership::factory()->create(['organization_id' => $org->id, 'platform_user_id' => $user->id,
            'role' => 'owner', 'status' => 'active']);
        OrganizationApplication::factory()->create(['organization_id' => $org->id, 'application_key' => 'crm', 'state' => 'installed']);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $org->id, 'application_key' => 'crm', 'source' => 'operator']);

        return Operation::create(['public_id' => (string) Str::uuid(), 'platform_user_id' => $user->id,
            'token_id' => $user->createToken('test', ['platform'])->accessToken->id, 'auth_version' => $user->auth_version,
            'scope' => 'test:'.$user->id, 'idempotency_key' => (string) Str::uuid(), 'payload_hash' => str_repeat('a', 64),
            'receipt_hash' => str_repeat('b', 64), 'action' => 'crm.companies.create',
            'payload' => ['organization_id' => $org->id, 'input' => ['name' => 'Company', 'code' => 'company']],
            'status' => Operation::Queued, 'available_at' => now()]);
    }

    private function response(Operation $op, int $status = 201): array
    {
        $remote = RemoteCommand::where('operation_id', $op->id)->firstOrFail();

        return ['id' => $remote->command_id, 'source' => $remote->service, 'destination' => 'platform', 'topic' => $remote->service.'.result',
            'version' => 1, 'payload' => ['operation_id' => $op->public_id, 'command_id' => $remote->command_id,
                'organization_id' => $remote->organization_id, 'action' => $remote->action, 'http_status' => $status,
                'result' => ['company' => ['id' => 17, 'name' => 'Company']]]];
    }

    public function test_pending_retries_are_durable_and_result_completion_is_correlated(): void
    {
        $op = $this->operation();
        $processor = app(OperationProcessor::class);
        for ($i = 0; $i < 5; $i++) {
            $this->assertTrue($processor->processNext());
            $this->assertSame(Operation::Queued, $op->refresh()->status);
            $this->assertSame(0, $op->attempts);
            $this->travel(3)->seconds();
        }
        $this->assertDatabaseCount('service_deliveries', 1);
        $this->assertDatabaseCount('remote_commands', 1);
        $response = $this->response($op);
        app(ServiceExchange::class)->accept($response, 'crm', 'platform');
        $this->assertTrue(app(RemoteCommandCoordinator::class)->consumeResult());
        DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($response));
        $this->assertTrue($processor->processNext());
        $this->assertSame(Operation::Succeeded, $op->refresh()->status);
        $this->assertSame(201, $op->http_status);
        $this->assertSame(17, $op->result['company']['id']);
        $this->assertFalse($processor->processNext());
    }

    public function test_deadline_is_terminal_without_reissuing_command(): void
    {
        $op = $this->operation();
        app(OperationProcessor::class)->processNext();
        $this->travel(6)->minutes();
        app(OperationProcessor::class)->processNext();
        $this->assertSame(504, $op->refresh()->http_status);
        $this->assertSame(Operation::Rejected, $op->status);
        $this->assertDatabaseCount('service_deliveries', 1);
        $this->expectException(HttpExceptionInterface::class);
        DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($this->response($op)));
    }

    public function test_result_cannot_cross_organization_or_survive_identity_revocation(): void
    {
        $op = $this->operation();
        app(OperationProcessor::class)->processNext();
        $response = $this->response($op);
        $bad = $response;
        $bad['payload']['organization_id']++;
        try {
            DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($bad));
            $this->fail('Cross-organization result accepted');
        } catch (HttpExceptionInterface $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
        PlatformUser::whereKey($op->platform_user_id)->increment('auth_version');
        $this->expectException(HttpExceptionInterface::class);
        DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($response));
    }

    public function test_local_transaction_is_mandatory(): void
    {
        $this->expectException(\LogicException::class);
        app(RemoteCommandCoordinator::class)->execute($this->operation(), PlatformUser::firstOrFail());
    }

    public function test_worker_roles_and_command_use_only_configured_peers(): void
    {
        config(['service_exchange.enabled' => true, 'service_exchange.name' => 'platform',
            'service_exchange.peers.crm' => ['url' => 'https://crm.test', 'key' => str_repeat('a', 32)],
            'service_exchange.peers.platform' => ['url' => 'https://platform.test', 'key' => str_repeat('a', 32)]]);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        $this->artisan('services:work', ['--once' => true])->assertExitCode(0);
        config(['service_exchange.name' => 'crm']);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'helpdesk']);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'learning']);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'builder']);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'insights']);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'erp']);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'hr']);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'lending']);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'platform', 'service_exchange.peers.helpdesk' => ['url' => 'https://helpdesk.test', 'key' => str_repeat('a', 32)]]);
        $this->assertFalse(app(ServiceWorker::class)->processNext());
        config(['service_exchange.name' => 'unknown']);
        $this->expectException(HttpExceptionInterface::class);
        app(ServiceWorker::class)->processNext();
    }

    public function test_resource_target_and_rejected_response_remain_durable(): void
    {
        $op = $this->operation();
        $op->update(['payload' => [...$op->payload, 'id' => 17]]);
        app(OperationProcessor::class)->processNext();
        $envelope = json_decode(ServiceDelivery::firstOrFail()->envelope, true);
        $this->assertSame(17, $envelope['payload']['command']['id']);
        $response = $this->response($op, 422);
        DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($response));
        app(OperationProcessor::class)->processNext();
        $this->assertSame(Operation::Rejected, $op->refresh()->status);
        $this->assertSame(422, $op->http_status);
        $response['payload']['result'] = ['message' => 'conflicting result'];
        $this->expectException(HttpExceptionInterface::class);
        DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($response));
    }

    public function test_assistant_child_is_persisted_once_and_completes_after_service_result(): void
    {
        $op = $this->operation();
        $user = PlatformUser::findOrFail($op->platform_user_id);
        $org = $op->payload['organization_id'];
        OrganizationApplication::factory()->create(['organization_id' => $org, 'application_key' => 'framework', 'state' => 'installed']);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $org]);
        $assistant = app(PlatformAssistantActions::class);
        $previewOp = new Operation(['platform_user_id' => $user->id, 'auth_version' => $user->auth_version,
            'receipt_hash' => $op->receipt_hash, 'payload' => ['input' => ['action' => 'standaloneCrmCreateCompany',
                'data' => ['organization_id' => $org, 'code' => 'assistant-company', 'name' => 'Assistant company']]]]);
        $preview = DB::transaction(fn () => $assistant->run($previewOp, $user));
        $op->update(['action' => 'platform.assistant', 'payload' => ['input' => [
            'conversation_id' => $preview['conversation_id'], 'conversation_version' => $preview['conversation_version'], 'confirm' => true]]]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(Operation::Queued, $op->refresh()->status);
        $child = Operation::where('parent_operation_id', $op->id)->firstOrFail();
        $this->assertSame(Operation::Delegated, $child->status);
        $duplicate = $op->replicate();
        $duplicate->public_id = (string) Str::uuid();
        $duplicate->idempotency_key = (string) Str::uuid();
        $duplicate->save();
        try {
            DB::transaction(fn () => $assistant->run($duplicate, $user));
            $this->fail('A second confirmation must not create a second command.');
        } catch (HttpExceptionInterface $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        $this->assertSame(1, Operation::whereNotNull('parent_operation_id')->count());
        $duplicate->delete();
        $this->travel(3)->seconds();
        app(OperationProcessor::class)->processNext();
        $this->assertDatabaseCount('remote_commands', 1);
        $this->assertDatabaseCount('service_deliveries', 1);
        DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($this->response($child)));
        app(OperationProcessor::class)->processNext();
        $this->assertSame(Operation::Succeeded, $op->refresh()->status);
        $this->assertSame(Operation::Succeeded, $child->refresh()->status);
        $this->assertSame(17, $op->result['api_result']['company']['id']);
        $this->assertSame($preview['conversation_version'], $op->result['conversation_version']);
        $assistant->authorizeResult($user, $op->result);
    }

    public function test_helpdesk_assistant_uses_durable_child_and_current_capabilities(): void
    {
        $op = $this->operation();
        $orgId = $op->payload['organization_id'];
        OrganizationApplication::factory()->create(['organization_id' => $orgId, 'application_key' => 'helpdesk', 'state' => 'installed']);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $orgId, 'application_key' => 'helpdesk', 'source' => 'operator']);
        $actions = config('platform.actions');
        foreach (app(ToolRegistry::class)->all() as $tool) {
            if (str_starts_with($tool['action'], 'standalone.helpdesk.')) {
                $actions[substr($tool['action'], 11)] = true;
            }
        }
        config(['platform.actions' => $actions, 'platform.applications.helpdesk' => ['available' => true, 'provisioned' => true],
            'platform.service_permissions' => [...config('platform.service_permissions'), 'helpdesk.queues.create' => 'owner']]);
        $user = PlatformUser::findOrFail($op->platform_user_id);
        $org = $op->payload['organization_id'];
        OrganizationApplication::factory()->create(['organization_id' => $org, 'application_key' => 'framework', 'state' => 'installed']);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $org]);
        $assistant = app(PlatformAssistantActions::class);
        $previewOp = new Operation(['platform_user_id' => $user->id, 'auth_version' => $user->auth_version,
            'receipt_hash' => $op->receipt_hash, 'payload' => ['input' => ['action' => 'standaloneHelpdeskCreateQueue',
                'data' => ['organization_id' => $org, 'code' => 'assistant-company', 'name' => 'Assistant company']]]]);
        $preview = DB::transaction(fn () => $assistant->run($previewOp, $user));
        $op->update(['action' => 'platform.assistant', 'payload' => ['input' => [
            'conversation_id' => $preview['conversation_id'], 'conversation_version' => $preview['conversation_version'], 'confirm' => true]]]);
        app(OperationProcessor::class)->processNext();
        $this->assertSame(Operation::Queued, $op->refresh()->status);
        $child = Operation::where('parent_operation_id', $op->id)->firstOrFail();
        $this->assertSame(Operation::Delegated, $child->status);
        $this->travel(3)->seconds();
        app(OperationProcessor::class)->processNext();
        $this->assertDatabaseCount('remote_commands', 1);
        $this->assertDatabaseCount('service_deliveries', 1);
        DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($this->response($child)));
        app(OperationProcessor::class)->processNext();
        $this->assertSame(Operation::Succeeded, $op->refresh()->status);
        $this->assertSame(Operation::Succeeded, $child->refresh()->status);
        $this->assertSame(17, $op->result['api_result']['company']['id']);
        $this->assertSame($preview['conversation_version'], $op->result['conversation_version']);
        $assistant->authorizeResult($user, $op->result);
    }

    public function test_continuous_worker_waits_and_does_not_hide_worker_failure(): void
    {
        $worker = \Mockery::mock(ServiceWorker::class);
        $worker->shouldReceive('processNext')->once()->andReturn(false)->ordered();
        $worker->shouldReceive('processNext')->once()->andThrow(new \RuntimeException('stop test'))->ordered();
        $this->app->instance(ServiceWorker::class, $worker);
        $this->expectException(\RuntimeException::class);
        $this->artisan('services:work')->run();
    }

    public function test_application_preview_injects_version_and_reauthorizes_result(): void
    {
        $op = $this->operation();
        $user = PlatformUser::findOrFail($op->platform_user_id);
        $org = $op->payload['organization_id'];
        OrganizationApplication::factory()->create(['organization_id' => $org, 'application_key' => 'framework', 'state' => 'installed']);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $org]);
        $assistant = app(PlatformAssistantActions::class);
        $previewOp = new Operation(['platform_user_id' => $user->id, 'auth_version' => $user->auth_version,
            'receipt_hash' => $op->receipt_hash, 'payload' => ['input' => ['action' => 'standaloneApplicationDisable',
                'data' => ['id' => $org, 'applicationKey' => 'crm']]]]);
        $preview = DB::transaction(fn () => $assistant->run($previewOp, $user));
        $this->assertSame('crm', $preview['preview']['application_key']);
        $this->assertSame(0, $preview['preview']['input']['expected_version']);
        $confirm = new Operation(['platform_user_id' => $user->id, 'auth_version' => $user->auth_version,
            'receipt_hash' => $op->receipt_hash, 'payload' => ['input' => ['conversation_id' => $preview['conversation_id'],
                'conversation_version' => $preview['conversation_version'], 'confirm' => true]]]);
        $done = DB::transaction(fn () => $assistant->run($confirm, $user));
        $this->assertSame('disabled', $done['api_result']['application']['state']);
        $assistant->authorizeResult($user, $done);
    }

    public function test_signed_subject_is_scoped_to_current_member_and_exact_assignment_actions(): void
    {
        $op = $this->operation();
        $org = $op->payload['organization_id'];
        $target = PlatformUser::factory()->create();
        $member = OrganizationMembership::factory()->create(['organization_id' => $org, 'platform_user_id' => $target->id,
            'role' => 'member', 'status' => 'active']);
        $coordinator = app(RemoteCommandCoordinator::class);
        $this->assertTrue($coordinator->subjectAllowed('crm.deals.create', $org, $target->id));
        $this->assertFalse($coordinator->subjectAllowed('crm.companies.create', $org, $target->id));
        $this->assertFalse($coordinator->subjectAllowed('helpdesk.agents.assign', $org, null));
        $this->assertFalse($coordinator->subjectAllowed('helpdesk.tickets.owner.assign', $org + 1, $target->id));
        config(['platform.actions' => [...config('platform.actions'), 'crm.deals.create' => true],
            'platform.service_permissions' => [...config('platform.service_permissions'), 'crm.deals.create' => 'admin']]);
        $op->update(['action' => 'crm.deals.create', 'payload' => ['organization_id' => $org,
            'input' => ['assignee_platform_user_id' => $target->id]]]);
        app(OperationProcessor::class)->processNext();
        $envelope = json_decode(ServiceDelivery::firstOrFail()->envelope, true);
        $this->assertSame($target->id, $envelope['payload']['scope']['subject_platform_user_id']);
        $member->update(['status' => 'revoked']);
        $this->assertFalse($coordinator->subjectAllowed('crm.deals.create', $org, $target->id));
    }

    public function test_assignment_subject_mapping_is_bound_for_each_supported_command(): void
    {
        foreach (['crm.deals.update' => 'assignee_platform_user_id', 'helpdesk.agents.assign' => 'target_platform_user_id',
            'helpdesk.tickets.owner.assign' => 'assigned_platform_user_id'] as $action => $field) {
            $op = $this->operation();
            $org = $op->payload['organization_id'];
            $service = explode('.', $action)[0];
            if ($service === 'helpdesk') {
                OrganizationApplication::factory()->create(['organization_id' => $org, 'application_key' => $service, 'state' => 'installed']);
                ApplicationEntitlementGrant::factory()->create(['organization_id' => $org, 'application_key' => $service, 'source' => 'operator']);
            }
            config(['platform.actions' => [...config('platform.actions'), $action => true],
                'platform.service_permissions' => [...config('platform.service_permissions'), $action => 'admin'],
                'platform.applications.'.$service => ['available' => true, 'provisioned' => true]]);
            $op->update(['action' => $action, 'payload' => ['organization_id' => $org, 'input' => [$field => $op->platform_user_id]]]);
            DB::transaction(fn () => app(RemoteCommandCoordinator::class)->execute($op, PlatformUser::findOrFail($op->platform_user_id)));
            $message = json_decode(ServiceDelivery::orderByDesc('id')->firstOrFail()->envelope, true);
            $this->assertSame($op->platform_user_id, $message['payload']['scope']['subject_platform_user_id']);
        }
    }

    public function test_application_executor_dispatches_catalog_install_and_reenable(): void
    {
        $op = $this->operation();
        $org = $op->payload['organization_id'];
        OrganizationApplication::factory()->create(['organization_id' => $org, 'application_key' => 'framework', 'state' => 'installed']);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $org]);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $org, 'application_key' => 'helpdesk', 'source' => 'operator']);
        config(['platform.applications.helpdesk' => ['available' => true, 'provisioned' => true, 'name' => 'Helpdesk', 'service' => 'helpdesk', 'contract_version' => '1.0']]);
        $executor = app(PlatformActionExecutor::class);
        foreach (['catalog' => [], 'install' => ['expected_version' => 0], 'disable' => ['expected_version' => 0],
            'reenable' => ['expected_version' => 1]] as $action => $input) {
            $op->action = 'platform.application.'.$action;
            $op->payload = ['input' => $input, 'id' => $org, 'application_key' => 'helpdesk'];
            $result = DB::transaction(fn () => $executor->execute($op));
            $this->assertIsArray($result);
        }
        $this->assertSame('installed', $result['application']['state']);
        $this->assertSame(2, $result['application']['version']);
    }

    public function test_service_wake_notifications_are_visible_only_after_commit(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('PostgreSQL notification semantics require PostgreSQL.');
        }
        $settings = config('database.connections.pgsql');
        $listener = new \PDO('pgsql:host='.$settings['host'].';port='.$settings['port'].';dbname='.$settings['database'],
            $settings['username'], $settings['password']);
        $listener->exec('LISTEN commerce_events');
        $message = json_decode(ServiceDelivery::factory()->make()->envelope, true);
        DB::beginTransaction();
        app(ServiceExchange::class)->enqueue($message);
        $this->assertFalse($listener->pgsqlGetNotify(\PDO::FETCH_ASSOC, 1));
        DB::rollBack();
        $this->assertFalse($listener->pgsqlGetNotify(\PDO::FETCH_ASSOC, 1));
        DB::transaction(fn () => app(ServiceExchange::class)->enqueue($message));
        $this->assertSame('commerce_events', $listener->pgsqlGetNotify(\PDO::FETCH_ASSOC, 1000)['message']);
        app(ServiceExchange::class)->accept($message, $message['source'], $message['destination']);
        $this->assertSame('commerce_events', $listener->pgsqlGetNotify(\PDO::FETCH_ASSOC, 1000)['message']);
        $listener->exec('UNLISTEN commerce_events');
    }

    public function test_crm_private_poll_rechecks_current_membership_and_model_options(): void
    {
        config(['service_exchange.peers.crm' => ['url' => 'https://crm.test', 'key' => str_repeat('a', 32)]]);
        Http::fake(function (Request $request) {
            $this->assertSame(0, DB::transactionLevel());
            $body = json_encode(['nonce' => $request['nonce'], 'allowed' => true]);

            return Http::response($body, 200, ['Content-Type' => 'application/json',
                'X-Service-Receipt' => ServiceAuthentication::receipt(
                    str_repeat('a', 32), $request->header('X-Service-Nonce')[0], $body)]);
        });
        $this->assertSame(['waiting', 'succeeded', 'rejected'], array_keys(RemoteCommand::options()));
        $op = $this->operation();
        app(OperationProcessor::class)->processNext();
        DB::transaction(fn () => app(RemoteCommandCoordinator::class)->acceptResult($this->response($op)));
        app(OperationProcessor::class)->processNext();
        $receipt = str_repeat('r', 64);
        $op->refresh()->update(['receipt_hash' => hash('sha256', $receipt)]);
        $user = PlatformUser::findOrFail($op->platform_user_id);
        Sanctum::actingAs($user, ['platform']);
        $path = '/api/v1/platform/operations/'.$op->public_id;
        $this->getJson($path, ['X-Operation-Token' => $receipt])->assertOk()->assertJsonPath('result.company.id', 17);
        $this->getJson($path, ['X-Operation-Token' => str_repeat('s', 64)])->assertNotFound();
        OrganizationMembership::where('platform_user_id', $user->id)->update(['status' => 'revoked']);
        $this->getJson($path, ['X-Operation-Token' => $receipt])->assertForbidden();
    }
}
