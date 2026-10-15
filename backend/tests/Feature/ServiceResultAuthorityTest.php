<?php

namespace Tests\Feature;

use App\Models\ApplicationEntitlementGrant;
use App\Models\Operation;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformConversation;
use App\Models\PlatformUser;
use App\Models\RemoteCommand;
use App\Models\ServiceDelivery;
use App\Models\ServiceInbox;
use App\Modules\Platform\PlatformAssistantActions;
use App\Modules\Platform\Services\RemoteResultGuard;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceResultAuthority;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ServiceResultAuthorityTest extends TestCase
{
    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        config(['service_exchange.enabled' => true, 'service_exchange.name' => 'crm',
            'service_exchange.peers.platform' => ['url' => 'https://platform.test', 'key' => str_repeat('a', 32), 'application' => 'crm']]);
        Route::prefix('api')->group(base_path('routes/service_exchange.php'));
        Http::preventStrayRequests();
    }

    private function stored(): array
    {
        $id = (string) Str::uuid();
        $operation = (string) Str::uuid();
        $scope = ['platform_user_id' => 1, 'organization_id' => 2, 'application' => 'crm',
            'action' => 'crm.companies.list', 'auth_version' => 0, 'token_id' => 3];
        $result = ['data' => [['id' => 5, 'name' => 'Private company']], 'meta' => ['total' => 1]];
        $command = ['id' => $id, 'source' => 'platform', 'destination' => 'crm', 'topic' => 'crm.command', 'version' => 1,
            'payload' => ['scope' => $scope, 'command' => ['operation_id' => $operation, 'input' => []]]];
        $response = ['id' => $id, 'source' => 'crm', 'destination' => 'platform', 'topic' => 'crm.result', 'version' => 1,
            'payload' => ['operation_id' => $operation, 'command_id' => $id, 'organization_id' => 2,
                'action' => $scope['action'], 'http_status' => 200, 'result' => $result]];
        ServiceInbox::factory()->create(['message_id' => $id, 'source' => 'platform', 'destination' => 'crm',
            'status' => ServiceInbox::Succeeded, 'envelope' => json_encode($command)]);
        ServiceDelivery::factory()->create(['message_id' => $id, 'source' => 'crm', 'destination' => 'platform',
            'envelope' => json_encode($response)]);

        return ['command_id' => $id, 'operation_id' => $operation, 'scope' => $scope,
            'result_digest' => ServiceResultAuthority::digest($result)];
    }

    private function central(bool $allowed, ?callable $during = null): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($allowed, $during) {
            $this->assertSame(0, DB::transactionLevel());
            $this->assertSame('https://platform.test/authorize', $request->url());
            if ($during) {
                $during();
            }
            $body = json_encode(['nonce' => $request['nonce'], 'allowed' => $allowed]);

            return Http::response($body, 200, ['Content-Type' => 'application/json',
                'X-Service-Receipt' => ServiceAuthentication::receipt(str_repeat('a', 32), $request->header('X-Service-Nonce')[0], $body)]);
        });
    }

    public function test_current_signed_central_decision_and_domain_policy_are_required(): void
    {
        $request = $this->stored();
        $this->central(true);
        $authority = app(ServiceResultAuthority::class);
        $this->assertTrue($authority->allows('crm', $request));
        $this->central(false);
        $this->assertFalse($authority->allows('crm', $request));
        $this->assertFalse($authority->allows('unknown', $request));
        config(['service_exchange.peers.platform.url' => 'http://unsafe.test']);
        $this->assertFalse($authority->allows('crm', $request));
    }

    public function test_missing_or_changed_result_scope_and_operation_never_disclose(): void
    {
        $request = $this->stored();
        $this->central(true);
        $authority = app(ServiceResultAuthority::class);
        foreach (['command_id' => (string) Str::uuid(), 'operation_id' => (string) Str::uuid(),
            'result_digest' => str_repeat('0', 64), 'scope' => [...$request['scope'], 'organization_id' => 99]] as $key => $value) {
            $this->assertFalse($authority->allows('crm', [...$request, $key => $value]), $key);
        }
        ServiceInbox::firstOrFail()->update(['status' => ServiceInbox::Queued]);
        $this->assertFalse($authority->allows('crm', $request));
        Http::assertNothingSent();
    }

    public function test_changed_local_snapshot_after_remote_authorization_fails_closed(): void
    {
        $request = $this->stored();
        $this->central(true, function (): void {
            $inbox = ServiceInbox::firstOrFail();
            $message = json_decode($inbox->envelope, true);
            $message['payload']['command']['input'] = ['page' => 2];
            $inbox->update(['envelope' => json_encode($message)]);
        });
        $this->assertFalse(app(ServiceResultAuthority::class)->allows('crm', $request));
    }

    public function test_signed_central_allow_does_not_override_unknown_domain_action(): void
    {
        $request = $this->stored();
        $request['scope']['action'] = 'crm.unknown';
        $inbox = ServiceInbox::firstOrFail();
        $message = json_decode($inbox->envelope, true);
        $message['payload']['scope'] = $request['scope'];
        $inbox->update(['envelope' => json_encode($message)]);
        $delivery = ServiceDelivery::firstOrFail();
        $response = json_decode($delivery->envelope, true);
        $response['payload']['action'] = 'crm.unknown';
        $delivery->update(['envelope' => json_encode($response)]);
        $this->central(true);
        $this->assertFalse(app(ServiceResultAuthority::class)->allows('crm', $request));
        Http::assertSentCount(1);
    }

    public function test_corrupt_or_misbound_stored_result_fails_closed(): void
    {
        $request = $this->stored();
        $this->central(true);
        $delivery = ServiceDelivery::firstOrFail();
        $original = json_decode($delivery->envelope, true);
        foreach (['source' => 'hr', 'destination' => 'foreign', 'version' => 2, 'topic' => 'crm.command',
            'id' => (string) Str::uuid(), 'payload' => [...$original['payload'], 'http_status' => 403]] as $key => $value) {
            $delivery->update(['envelope' => json_encode([...$original, $key => $value])]);
            $this->assertFalse(app(ServiceResultAuthority::class)->allows('crm', $request), $key);
        }
        $delivery->update(['envelope' => '{']);
        $this->assertFalse(app(ServiceResultAuthority::class)->allows('crm', $request));
        Http::assertNothingSent();
    }

    public function test_authority_refuses_network_work_inside_transaction(): void
    {
        $request = $this->stored();
        $this->expectException(\LogicException::class);
        DB::transaction(fn () => app(ServiceResultAuthority::class)->allows('crm', $request));
    }

    public function test_digest_canonicalizes_maps_but_preserves_list_order(): void
    {
        $this->assertSame(ServiceResultAuthority::digest(['b' => ['y' => 1, 'x' => 2], 'a' => 3]),
            ServiceResultAuthority::digest(['a' => 3, 'b' => ['x' => 2, 'y' => 1]]));
        $this->assertNotSame(ServiceResultAuthority::digest([1, 2]), ServiceResultAuthority::digest([2, 1]));
    }

    public function test_result_transport_requires_fresh_nonce_and_authenticated_receipt(): void
    {
        $transport = new ServiceTransport('https://crm.test', str_repeat('a', 32));
        foreach ([true, false] as $fresh) {
            Http::swap(new Factory);
            Http::preventStrayRequests();
            Http::fake(function (Request $request) use ($fresh) {
                $body = json_encode(['nonce' => $fresh ? $request['nonce'] : (string) Str::uuid(), 'allowed' => true]);

                return Http::response($body, 200, ['Content-Type' => 'application/json',
                    'X-Service-Receipt' => ServiceAuthentication::receipt(str_repeat('a', 32), $request->header('X-Service-Nonce')[0], $body)]);
            });
            $this->assertSame($fresh, $transport->authorizeResult($this->stored()));
        }
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['allowed' => true], 200, ['Content-Type' => 'application/json'])]);
        $this->expectException(\RuntimeException::class);
        $transport->authorizeResult($this->stored());
    }

    public function test_signed_endpoint_binds_service_and_validates_result_request(): void
    {
        $request = [...$this->stored(), 'nonce' => (string) Str::uuid()];
        $this->central(true);
        $send = function (array $body) {
            $path = '/api/v1/internal/services/result-authority';
            $nonce = (string) Str::uuid();
            $time = (string) now()->timestamp;
            $response = $this->withServerVariables(['HTTPS' => 'on'])->postJson('https://localhost'.$path, $body,
                ['X-Service-Source' => 'platform', 'X-Service-Destination' => 'crm', 'X-Service-Nonce' => $nonce,
                    'X-Service-Timestamp' => $time, 'X-Service-Signature' => ServiceAuthentication::signature(str_repeat('a', 32),
                        'POST', $path, 'platform', 'crm', $time, $nonce, json_encode($body))]);

            return [$response, $nonce];
        };
        [$response, $nonce] = $send($request);
        $response->assertOk()->assertExactJson(['nonce' => $request['nonce'], 'allowed' => true]);
        $this->assertSame(ServiceAuthentication::receipt(str_repeat('a', 32), $nonce, $response->getContent()),
            $response->headers->get('X-Service-Receipt'));
        $send([...$request, 'result_digest' => 'invalid'])[0]->assertUnprocessable()->assertJsonStructure(['validation_error']);
        config(['service_exchange.peers.platform.application' => 'hr']);
        $send($request)[0]->assertForbidden();
    }

    private function completedOperation(): Operation
    {
        $user = PlatformUser::factory()->create();
        $org = Organization::factory()->create();
        OrganizationMembership::factory()->create(['organization_id' => $org->id,
            'platform_user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);
        foreach (['crm', 'framework'] as $app) {
            OrganizationApplication::factory()->create(['organization_id' => $org->id, 'application_key' => $app, 'state' => 'installed']);
            ApplicationEntitlementGrant::factory()->create(['organization_id' => $org->id, 'application_key' => $app, 'source' => 'operator']);
        }
        config(['platform.actions' => [...config('platform.actions'), 'crm.companies.list' => true, 'platform.assistant' => true],
            'platform.service_permissions' => [...config('platform.service_permissions'), 'crm.companies.list' => 'member'],
            'platform.applications.crm' => ['available' => true, 'provisioned' => true],
            'service_exchange.peers.crm' => ['url' => 'https://crm.test', 'key' => str_repeat('a', 32)]]);
        $operation = Operation::create(['public_id' => (string) Str::uuid(), 'platform_user_id' => $user->id,
            'token_id' => $user->createToken('test', ['platform'])->accessToken->id, 'auth_version' => $user->auth_version,
            'scope' => 'test:'.$user->id, 'idempotency_key' => (string) Str::uuid(), 'payload_hash' => str_repeat('a', 64),
            'receipt_hash' => hash('sha256', str_repeat('a', 64)), 'action' => 'crm.companies.list',
            'payload' => ['organization_id' => $org->id, 'input' => []], 'status' => 'succeeded', 'http_status' => 200,
            'result' => ['data' => [['id' => 1, 'name' => 'Secret company']], 'meta' => ['total' => 1]], 'available_at' => now()]);
        $remote = RemoteCommand::factory()->create(['operation_id' => $operation->id,
            'organization_id' => $org->id, 'status' => 'succeeded', 'result' => $operation->result]);
        $message = ['id' => $remote->command_id, 'source' => 'platform', 'destination' => 'crm', 'version' => 1, 'topic' => 'crm.command',
            'payload' => ['command' => ['operation_id' => $operation->public_id, 'input' => []], 'scope' => [
                'platform_user_id' => $user->id, 'auth_version' => $user->auth_version, 'token_id' => $operation->token_id,
                'organization_id' => $org->id, 'application' => 'crm', 'action' => $operation->action]]];
        ServiceDelivery::factory()->create(['message_id' => $remote->command_id, 'source' => 'platform',
            'destination' => 'crm', 'envelope' => json_encode($message)]);
        Sanctum::actingAs($user, ['platform']);

        return $operation;
    }

    private function remoteDecision(bool $allowed, ?callable $during = null): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(function (Request $request) use ($allowed, $during) {
            $this->assertSame(0, DB::transactionLevel());
            $this->assertSame('https://crm.test/result-authority', $request->url());
            if ($during) {
                $during();
            }
            $body = json_encode(['nonce' => $request['nonce'], 'allowed' => $allowed]);

            return Http::response($body, 200, ['Content-Type' => 'application/json',
                'X-Service-Receipt' => ServiceAuthentication::receipt(str_repeat('a', 32), $request->header('X-Service-Nonce')[0], $body)]);
        });
    }

    public function test_completed_poll_rechecks_remote_policy_and_central_revocation_outside_transactions(): void
    {
        $operation = $this->completedOperation();
        $path = '/api/v1/platform/operations/'.$operation->public_id;
        $this->remoteDecision(true);
        $this->getJson($path)->assertOk()->assertJsonPath('result.data.0.name', 'Secret company');
        $this->remoteDecision(false);
        $this->getJson($path)->assertForbidden()->assertDontSee('Secret company');
        $this->remoteDecision(true, fn () => OrganizationMembership::query()->update(['status' => 'revoked']));
        $this->getJson($path)->assertForbidden()->assertDontSee('Secret company');
    }

    public function test_poll_cannot_swap_result_after_remote_authority_checked_it(): void
    {
        $operation = $this->completedOperation();
        $this->remoteDecision(true, fn () => $operation->update(['result' => ['secret' => 'unapproved']]));
        $this->getJson('/api/v1/platform/operations/'.$operation->public_id)->assertConflict()->assertDontSee('unapproved');
    }

    public function test_remote_poll_denies_missing_configuration_and_mismatched_binding(): void
    {
        $operation = $this->completedOperation();
        $path = '/api/v1/platform/operations/'.$operation->public_id;
        config(['service_exchange.peers.crm.url' => 'http://unsafe.test']);
        $this->getJson($path)->assertForbidden();
        $operation->update(['result' => ['data' => []]]);
        $this->getJson($path)->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_assistant_completed_conversation_replay_is_reauthorized_at_disclosure(): void
    {
        $child = $this->completedOperation();
        $parent = $child->replicate();
        $parent->public_id = (string) Str::uuid();
        $parent->idempotency_key = (string) Str::uuid();
        $parent->action = 'platform.assistant';
        $parent->save();
        $conversation = PlatformConversation::factory()->create(['platform_user_id' => $child->platform_user_id,
            'auth_version' => $child->auth_version, 'receipt_hash' => $child->receipt_hash, 'status' => 'completed', 'version' => 0,
            'action' => 'standaloneCrmCompanies', 'draft' => ['delegated_operation_id' => $child->id, 'prepared' => $child->payload]]);
        $child->update(['parent_operation_id' => $parent->id, 'payload' => [...$child->payload, 'conversation_id' => $conversation->public_id]]);
        $result = ['conversation_id' => $conversation->public_id, 'conversation_version' => $conversation->version,
            'status' => 'completed', 'executed_action' => 'crm.companies.list', 'api_result' => $child->result];
        $conversation->update(['result' => $result]);
        $parent->update(['result' => $result]);
        $this->remoteDecision(true);
        $path = '/api/v1/platform/operations/'.$parent->public_id;
        $this->getJson($path)->assertOk()->assertJsonPath('result.api_result.data.0.name', 'Secret company');
        $replay = $parent->replicate();
        $replay->public_id = (string) Str::uuid();
        $replay->idempotency_key = (string) Str::uuid();
        $replay->payload = ['input' => ['conversation_id' => $conversation->public_id, 'conversation_version' => $conversation->version]];
        $replay->save();
        $user = PlatformUser::findOrFail($child->platform_user_id);
        $this->assertSame($result, DB::transaction(fn () => app(PlatformAssistantActions::class)->run($replay, $user)));
        $this->remoteDecision(false);
        $this->getJson('/api/v1/platform/operations/'.$replay->public_id)->assertForbidden()->assertDontSee('Secret company');
        $child->update(['receipt_hash' => str_repeat('b', 64)]);
        $this->remoteDecision(true);
        $this->getJson($path)->assertForbidden();
    }

    public function test_remote_guard_ignores_local_results_and_rejects_transactional_network_calls(): void
    {
        $guard = app(RemoteResultGuard::class);
        $guard->authorize(new Operation(['action' => 'platform.organization.list', 'result' => []]));
        $guard->authorize(new Operation(['action' => 'platform.assistant', 'result' => []]));
        DB::transaction(function () use ($guard): void {
            $guard->authorize(new Operation(['action' => 'platform.organization.list', 'result' => []]));
            $guard->authorize(new Operation(['action' => 'platform.assistant',
                'result' => ['executed_action' => 'platform.organization.list']]));
        });
        Http::assertNothingSent();
        $this->expectException(\LogicException::class);
        DB::transaction(fn () => $guard->authorize(new Operation(['action' => 'crm.companies.list'])));
    }

    public function test_assistant_remote_result_refuses_transaction_before_lookup_or_network(): void
    {
        $this->expectException(\LogicException::class);
        DB::transaction(fn () => app(RemoteResultGuard::class)->authorize(
            new Operation(['action' => 'platform.assistant', 'result' => ['executed_action' => 'crm.companies.list']])
        ));
    }
}
