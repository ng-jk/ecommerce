<?php

namespace Tests\Feature;

use App\Domain\OperationProcessor;
use App\Http\Controllers\PlatformOperationController;
use App\Models\Operation;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PlatformOperationBoundaryTest extends TestCase
{
    use RefreshDatabase;

    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    private function request(string $method, string $path, array $input = [], ?string $token = null, array $extra = []): TestResponse
    {
        Auth::forgetGuards();

        return $this->json($method, $path, $input, [...($token ? ['Authorization' => 'Bearer '.$token] : []),
            'X-Operation-Token' => str_repeat('d', 64), 'Idempotency-Key' => (string) Str::uuid(), ...$extra]);
    }

    private function finish(TestResponse $accepted, ?string $token): TestResponse
    {
        $accepted->assertAccepted();
        $this->assertTrue(app(OperationProcessor::class)->processNext());

        return $this->request('GET', $accepted->json('poll_url'), token: $token)->assertOk();
    }

    private function workspace(string $token): int
    {
        $result = $this->finish($this->request('POST', '/api/v1/platform/organizations',
            ['code' => 'space-'.fake()->unique()->numberBetween(100, 999999), 'name' => 'Workspace'], $token), $token);

        return $result->json('result.organization.id');
    }

    public function test_real_tokens_recheck_ability_revocation_expiry_and_model_binding_in_worker(): void
    {
        $user = PlatformUser::factory()->create();
        $restricted = $user->createToken('restricted', ['read']);
        $this->request('GET', '/api/v1/platform/auth/me', token: $restricted->plainTextToken)->assertForbidden();
        foreach (['delete', 'ability', 'morph', 'expiry'] as $change) {
            $issued = $user->createToken('scoped', ['platform'], now()->addHour());
            $accepted = $this->request('GET', '/api/v1/platform/auth/me', token: $issued->plainTextToken)->assertAccepted();
            match ($change) {
                'delete' => $issued->accessToken->delete(),
                'ability' => $issued->accessToken->update(['abilities' => ['read']]),
                'morph' => $issued->accessToken->forceFill(['tokenable_type' => User::class])->save(),
                'expiry' => $issued->accessToken->update(['expires_at' => now()->subSecond()]),
            };
            $this->assertTrue(app(OperationProcessor::class)->processNext());
            $op = Operation::where('public_id', $accepted->json('operation_id'))->firstOrFail();
            $this->assertSame(Operation::Rejected, $op->status, $change);
            $this->assertSame(401, $op->http_status);
        }
    }

    public function test_capability_disable_is_enforced_at_acceptance_execution_and_polling(): void
    {
        $user = PlatformUser::factory()->create();
        $token = $user->createToken('platform', ['platform'])->plainTextToken;
        $accepted = $this->request('GET', '/api/v1/platform/auth/me', token: $token)->assertAccepted();
        $actions = config('platform.actions');
        $actions['platform.auth.me'] = false;
        config(['platform.actions' => $actions]);
        $this->request('GET', '/api/v1/platform/auth/me', token: $token)->assertForbidden();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $this->assertDatabaseHas('operations', ['public_id' => $accepted->json('operation_id'), 'status' => 'rejected', 'http_status' => 403]);
        $this->request('GET', $accepted->json('poll_url'), token: $token)->assertForbidden();
        $this->request('POST', '/api/v1/platform/assistant', ['message' => str_repeat('x', 66000)], $token)->assertStatus(413);
        $this->request('GET', '/api/v1/platform/organizations', token: $token,
            extra: ['X-Operation-Token' => 'invalid'])->assertUnprocessable()->assertJsonStructure(['validation_error']);
    }

    public function test_membership_commands_use_real_worker_and_queued_or_completed_access_is_revocable(): void
    {
        $owner = PlatformUser::factory()->create();
        $ownerToken = $owner->createToken('owner', ['platform'])->plainTextToken;
        $id = $this->workspace($ownerToken);
        $base = '/api/v1/platform/organizations/'.$id;
        foreach (['/api/v1/platform/organizations', $base, $base.'/applications', $base.'/memberships'] as $path) {
            $this->finish($this->request('GET', $path, token: $ownerToken), $ownerToken)->assertJsonPath('status', 'succeeded');
        }
        $this->finish($this->request('PATCH', $base, ['name' => 'Renamed', 'expected_version' => 0], $ownerToken), $ownerToken)
            ->assertJsonPath('result.organization.name', 'Renamed');
        $member = PlatformUser::factory()->create();
        $memberToken = $member->createToken('member', ['platform'])->plainTextToken;
        $invited = $this->finish($this->request('POST', $base.'/memberships', ['platform_user_id' => $member->id, 'role' => 'member'], $ownerToken), $ownerToken);
        $membership = $invited->json('result.membership.id');
        $path = $base.'/memberships/'.$membership;
        $this->finish($this->request('GET', $path, token: $ownerToken), $ownerToken)->assertJsonPath('result.membership.status', 'invited');
        $this->finish($this->request('POST', $path.'/accept', ['expected_version' => 0], $memberToken), $memberToken)->assertJsonPath('result.membership.status', 'active');
        $this->finish($this->request('PATCH', $path, ['role' => 'admin', 'expected_version' => 1], $ownerToken), $ownerToken)->assertJsonPath('result.membership.role', 'admin');
        $completed = $this->request('GET', $base, token: $memberToken);
        $this->finish($completed, $memberToken)->assertJsonPath('status', 'succeeded');
        $queued = $this->request('GET', $base, token: $memberToken)->assertAccepted();
        OrganizationMembership::whereKey($membership)->update(['status' => 'revoked']);
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $this->assertDatabaseHas('operations', ['public_id' => $queued->json('operation_id'), 'status' => 'rejected']);
        $this->request('GET', $completed->json('poll_url'), token: $memberToken)->assertNotFound();
        OrganizationMembership::whereKey($membership)->update(['status' => 'active']);
        $this->finish($this->request('POST', $path.'/revoke', ['expected_version' => 2], $ownerToken), $ownerToken)->assertJsonPath('result.membership.status', 'revoked');
    }

    public function test_assistant_preview_confirmation_and_logout_poll_use_private_durable_receipts(): void
    {
        $user = PlatformUser::factory()->create();
        $token = $user->createToken('assistant', ['platform'])->plainTextToken;
        $preview = $this->finish($this->request('POST', '/api/v1/platform/assistant',
            ['action' => 'standaloneCreateOrganization', 'data' => ['code' => 'assistant-space', 'name' => 'Assistant Space']], $token), $token);
        $this->assertDatabaseCount('organizations', 0);
        $confirm = ['conversation_id' => $preview->json('result.conversation_id'),
            'conversation_version' => $preview->json('result.conversation_version'), 'confirm' => true];
        $this->finish($this->request('POST', '/api/v1/platform/assistant', $confirm, $token), $token)->assertJsonPath('result.api_result.organization.code', 'assistant-space');
        $logoutPreview = $this->finish($this->request('POST', '/api/v1/platform/assistant', ['action' => 'platformLogout'], $token), $token);
        $logout = $this->request('POST', '/api/v1/platform/assistant', ['conversation_id' => $logoutPreview->json('result.conversation_id'),
            'conversation_version' => $logoutPreview->json('result.conversation_version'), 'confirm' => true], $token)->assertAccepted();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $this->request('GET', $logout->json('poll_url'))->assertOk()->assertJsonPath('result.api_result.logged_out', true);
        $this->request('GET', $logout->json('poll_url'), extra: ['X-Operation-Token' => str_repeat('e', 64)])->assertNotFound();
        $this->request('GET', '/api/v1/platform/auth/me', token: $token)->assertUnauthorized();
        $this->assertDatabaseCount('organizations', 1);
    }

    public function test_public_login_result_is_not_disclosed_after_issued_token_revocation(): void
    {
        $user = PlatformUser::factory()->create(['password' => 'long-password-123']);
        $accepted = $this->request('POST', '/api/v1/platform/auth/login', ['email' => $user->email,
            'password' => 'long-password-123', 'device_name' => 'test']);
        $result = $this->finish($accepted, null);
        $this->assertNotEmpty($result->json('result.token'));
        $user->tokens()->delete();
        $this->request('GET', $accepted->json('poll_url'))->assertForbidden();
    }

    public function test_misconfigured_unknown_command_cannot_execute_a_worker_action(): void
    {
        $actions = config('platform.actions');
        $actions['platform.unknown'] = true;
        config(['platform.actions' => $actions]);
        Route::post('/api/test/platform-unknown', [PlatformOperationController::class, 'submit'])
            ->middleware('auth:sanctum')->name('platform.unknown');
        $user = PlatformUser::factory()->create();
        $token = $user->createToken('unknown', ['platform'])->plainTextToken;
        $accepted = $this->request('POST', '/api/test/platform-unknown', token: $token)->assertAccepted();
        $this->assertTrue(app(OperationProcessor::class)->processNext());
        $this->request('GET', $accepted->json('poll_url'), token: $token)->assertOk()
            ->assertJsonPath('status', 'rejected')->assertJsonPath('http_status', 422)
            ->assertJsonStructure(['result' => ['validation_error' => ['action']]]);
    }
}
