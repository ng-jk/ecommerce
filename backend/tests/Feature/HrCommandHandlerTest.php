<?php

namespace Tests\Feature;

use App\Modules\Hr\HrActions;
use App\Modules\Hr\HrCommandHandler;
use App\Modules\Hr\Models\HrEmployee;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class HrCommandHandlerTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/hr', '--force' => true]);
    }

    private function command(string $action, array $input, ?int $id = null, ?int $subject = null): array
    {
        $command = ['operation_id' => (string) Str::uuid(), 'input' => $input];
        if ($id !== null) {
            $command['id'] = $id;
        }
        $scope = ['platform_user_id' => 17, 'organization_id' => 9, 'application' => 'hr',
            'action' => $action, 'auth_version' => 1, 'token_id' => 29];
        if ($subject !== null) {
            $scope['subject_platform_user_id'] = $subject;
        }

        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'hr',
            'topic' => 'hr.command', 'version' => 1,
            'payload' => ['scope' => $scope, 'command' => $command]];
    }

    private function responsePayload(array $command): array
    {
        $row = DB::table('service_deliveries')->where('source', 'hr')->where('message_id', $command['id'])->firstOrFail();

        return json_decode($row->envelope, true, 32, JSON_THROW_ON_ERROR)['payload'];
    }

    public function test_worker_fences_authorization_effect_and_correlated_result_with_replay_safety(): void
    {
        $key = str_repeat('r', 64);
        $allowed = true;
        Http::fake(function ($request) use ($key, &$allowed) {
            $body = json_decode($request->body(), true, 32, JSON_THROW_ON_ERROR);
            $reply = json_encode(['nonce' => $body['nonce'], 'allowed' => $allowed], JSON_THROW_ON_ERROR);
            $nonce = $request->header('X-Service-Nonce')[0];

            return Http::response($reply, 200, ['Content-Type' => 'application/json',
                'X-Service-Receipt' => ServiceAuthentication::receipt($key, $nonce, $reply)]);
        });
        $exchange = app(ServiceExchange::class);
        $handler = new HrCommandHandler($exchange,
            new ServiceTransport('https://platform.example/internal', $key, 'hr', 'platform'), app(HrActions::class));

        $create = $this->command('hr.employees.create', ['code' => 'staff-one', 'display_name' => 'Maya',
            'timezone' => 'UTC', 'linked_platform_user_id' => 22], null, 22);
        $this->assertSame('accepted', $exchange->accept($create, 'platform', 'hr')['status']);
        $this->assertSame('accepted', $exchange->accept($create, 'platform', 'hr')['status']);
        $this->assertTrue($handler->consumeOne());
        $response = $this->responsePayload($create);
        $this->assertSame(201, $response['http_status']);
        $this->assertSame($create['payload']['command']['operation_id'], $response['operation_id']);
        $this->assertSame($create['id'], $response['command_id']);
        $employeeId = $response['result']['employee']['id'];
        $this->assertSame(9, DB::table('hr_employees')->where('id', $employeeId)->value('organization_id'));
        $this->assertSame(1, DB::table('hr_employees')->count());
        $this->assertFalse($handler->consumeOne());

        $invalid = $this->command('hr.employees.create', ['code' => 'bad', 'display_name' => 'Bad',
            'timezone' => 'UTC', 'linked_platform_user_id' => 22, 'organization_id' => 999], null, 22);
        $exchange->accept($invalid, 'platform', 'hr');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(422, $this->responsePayload($invalid)['http_status']);
        $this->assertArrayHasKey('organization_id', $this->responsePayload($invalid)['result']['validation_error']);

        $missing = $this->command('hr.employees.owner.detail', [], 9999);
        $exchange->accept($missing, 'platform', 'hr');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(404, $this->responsePayload($missing)['http_status']);

        $stale = $this->command('hr.employees.update', ['display_name' => 'Stale', 'timezone' => 'UTC',
            'status' => 'active', 'expected_version' => 9], $employeeId);
        $exchange->accept($stale, 'platform', 'hr');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame(409, $this->responsePayload($stale)['http_status']);

        $allowed = false;
        $denied = $this->command('hr.leave.types.create', ['code' => 'denied', 'name' => 'Denied', 'allowance_days' => 2]);
        $exchange->accept($denied, 'platform', 'hr');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('failed', DB::table('service_inboxes')->where('message_id', $denied['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $denied['id'])->first());
        $this->assertSame(0, DB::table('hr_leave_types')->count());

        $allowed = true;
        HrEmployee::creating(fn () => abort(503, 'HR dependency unavailable.'));
        $transient = $this->command('hr.employees.create', ['code' => 'retry', 'display_name' => 'Retry',
            'timezone' => 'UTC', 'linked_platform_user_id' => 23], null, 23);
        $exchange->accept($transient, 'platform', 'hr');
        $this->assertTrue($handler->consumeOne());
        $this->assertSame('queued', DB::table('service_inboxes')->where('message_id', $transient['id'])->value('status'));
        $this->assertNull(DB::table('service_deliveries')->where('message_id', $transient['id'])->first());
        $this->assertSame(1, DB::table('hr_employees')->count());
    }
}
