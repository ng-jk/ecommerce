<?php

namespace Tests\Feature;

use App\Models\ApplicationEntitlementGrant;
use App\Models\ApplicationEntitlementRevocation;
use App\Models\Organization;
use App\Models\OrganizationApplication;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\ServiceDelivery;
use App\Modules\Platform\Services\ServiceAuthentication;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class ServiceIngressTest extends TestCase
{
    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('migrate:fresh', ['--force' => true])->assertExitCode(0);
        Route::prefix('api')->group(base_path('routes/service_exchange.php'));
        config(['platform.actions' => [...config('platform.actions'), 'framework.read' => true], 'platform.applications.framework.provisioned' => true, 'service_exchange.enabled' => true, 'service_exchange.name' => 'crm',
            'service_exchange.peers.platform' => ['key' => str_repeat('a', 32), 'topics' => ['organization.changed'],
                'application' => 'framework', 'actions' => ['framework.read' => ['owner', 'member']]]]);
    }

    private function sendSigned(string $endpoint, array $body, array $overrides = []): TestResponse
    {
        $path = '/api/v1/internal/services/'.$endpoint;
        $timestamp = (string) now()->timestamp;
        $nonce = (string) Str::uuid();
        $headers = ['Content-Type' => 'application/json', 'X-Service-Source' => 'platform',
            'X-Service-Destination' => 'crm', 'X-Service-Nonce' => $nonce, 'X-Service-Timestamp' => $timestamp,
            'X-Service-Signature' => ServiceAuthentication::signature(str_repeat('a', 32), 'POST', $path,
                'platform', 'crm', $timestamp, $nonce, json_encode($body))];

        return $this->withServerVariables(['HTTPS' => 'on'])->postJson('https://localhost'.$path, $body, [...$headers, ...$overrides]);
    }

    public function test_signed_ingress_commits_receipt_deduplicates_body_and_rejects_nonce_replay(): void
    {
        $message = json_decode(ServiceDelivery::factory()->make()->envelope, true);
        $message['payload']['display'] = '  keep spaces  ';
        $first = $this->sendSigned('inbox', $message)->assertAccepted();
        $this->assertSame(hash('sha256', json_encode($message)), $first->json('digest'));
        $this->sendSigned('inbox', $message)->assertAccepted()->assertExactJson($first->json());
        $this->assertDatabaseCount('service_inboxes', 1);
        $this->assertNotEmpty($first->headers->get('X-Service-Receipt'));
        $nonce = DB::table('service_request_nonces')->first()->nonce;
        $this->sendSigned('inbox', $message, ['X-Service-Nonce' => $nonce])->assertUnauthorized();
        $timestamp = (string) now()->timestamp;
        $signature = ServiceAuthentication::signature(str_repeat('a', 32), 'POST', '/api/v1/internal/services/inbox',
            'platform', 'crm', $timestamp, $nonce, json_encode($message));
        $this->sendSigned('inbox', $message, ['X-Service-Nonce' => $nonce, 'X-Service-Timestamp' => $timestamp,
            'X-Service-Signature' => $signature])->assertConflict();
    }

    public function test_ingress_rejects_customer_credentials_foreign_destination_stale_signature_and_bad_payload(): void
    {
        $message = json_decode(ServiceDelivery::factory()->make()->envelope, true);
        foreach ([['X-Service-Source' => 'unknown'], ['X-Service-Destination' => 'foreign'],
            ['X-Service-Timestamp' => '1'], ['X-Service-Signature' => str_repeat('0', 64)]] as $headers) {
            $this->sendSigned('inbox', $message, $headers)->assertUnauthorized();
        }
        $this->sendSigned('inbox', [...$message, 'topic' => 'unknown'])->assertForbidden();
        $this->sendSigned('inbox', [...$message, 'version' => 2])->assertUnprocessable()->assertJsonStructure(['validation_error' => ['message']]);
        $this->sendSigned('inbox', $message)->assertAccepted();
        $this->sendSigned('inbox', [...$message, 'payload' => []])->assertConflict();
        config(['service_exchange.enabled' => false]);
        $this->sendSigned('inbox', $message)->assertNotFound();
    }

    public function test_authority_rechecks_identity_token_membership_installation_and_service_scope(): void
    {
        $user = PlatformUser::factory()->create();
        $org = Organization::factory()->create();
        $grant = ApplicationEntitlementGrant::factory()->create(['organization_id' => $org->id]);
        $member = OrganizationMembership::factory()->create(['organization_id' => $org->id, 'user_id' => null,
            'platform_user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);
        $install = OrganizationApplication::factory()->create(['organization_id' => $org->id, 'application_key' => 'framework', 'state' => 'installed']);
        $token = $user->createToken('worker-test', ['platform'], now()->addHour());
        $scope = ['platform_user_id' => $user->id, 'organization_id' => $org->id, 'application' => 'framework',
            'action' => 'framework.read', 'auth_version' => $user->auth_version, 'token_id' => $token->accessToken->id];
        $body = ['nonce' => (string) Str::uuid(), 'scope' => $scope];
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', true);
        $body['scope']['subject_platform_user_id'] = $user->id;
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        unset($body['scope']['subject_platform_user_id']);
        config(['platform.actions' => [...config('platform.actions'), 'framework.read' => false]]);
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        config(['platform.actions' => [...config('platform.actions'), 'framework.read' => true], 'platform.applications.framework.provisioned' => false]);
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        config(['platform.applications.framework.provisioned' => true]);
        ApplicationEntitlementRevocation::factory()->create(['grant_id' => $grant->id]);
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        ApplicationEntitlementGrant::factory()->create(['organization_id' => $org->id]);
        $member->update(['status' => 'revoked']);
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        $member->update(['status' => 'active']);
        $install->update(['state' => 'disabled']);
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        $install->update(['state' => 'installed']);
        $user->increment('auth_version');
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        $body['scope']['auth_version'] = $user->auth_version;
        $token->accessToken->delete();
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        $body['scope']['application'] = 'erp';
        $this->sendSigned('authorize', $body)->assertOk()->assertJsonPath('allowed', false);
        $body['scope']['role'] = 'owner';
        $this->sendSigned('authorize', $body)->assertUnprocessable();
    }

    public function test_malformed_signed_json_is_rejected_with_validation_contract(): void
    {
        foreach (['{', 'null'] as $raw) {
            $nonce = (string) Str::uuid();
            $time = (string) now()->timestamp;
            $path = '/api/v1/internal/services/inbox';
            $response = $this->call('POST', 'https://localhost'.$path, [], [], [], [
                'HTTPS' => 'on', 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
                'HTTP_X_SERVICE_SOURCE' => 'platform', 'HTTP_X_SERVICE_DESTINATION' => 'crm',
                'HTTP_X_SERVICE_NONCE' => $nonce, 'HTTP_X_SERVICE_TIMESTAMP' => $time,
                'HTTP_X_SERVICE_SIGNATURE' => ServiceAuthentication::signature(str_repeat('a', 32), 'POST', $path,
                    'platform', 'crm', $time, $nonce, $raw),
            ], $raw);
            $response->assertUnprocessable()->assertJsonStructure(['validation_error' => ['message']]);
        }
        $this->assertDatabaseCount('service_inboxes', 0);
    }
}
