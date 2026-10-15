<?php

namespace Tests\Feature;

use App\Modules\Helpdesk\AuthorizedHelpdeskScope;
use App\Modules\Helpdesk\HelpdeskActions;
use App\Modules\Helpdesk\Models\HelpdeskQueue;
use App\Modules\Helpdesk\Models\HelpdeskQueueAgent;
use App\Modules\Hr\AuthorizedHrScope;
use App\Modules\Hr\HrActions;
use App\Modules\Lending\AuthorizedLendingScope;
use App\Modules\Lending\LendingActions;
use App\Modules\Platform\Services\RemoteCommandCoordinator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use ReflectionClass;
use ReflectionMethod;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class ServiceResultGuardCoverageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/helpdesk', '--force' => true]);
    }

    private function forgedScope(string $class, string $action): object
    {
        // A saved result guard must remain closed even if an internal caller bypasses envelope validation.
        $reflection = new ReflectionClass($class);
        $scope = $reflection->newInstanceWithoutConstructor();
        foreach (['organizationId' => 7, 'platformUserId' => 11, 'action' => $action] as $field => $value) {
            $reflection->getProperty($field)->setValue($scope, $value);
        }
        if ($class === AuthorizedHrScope::class) {
            $reflection->getProperty('subjectPlatformUserId')->setValue($scope, null);
        }

        return $scope;
    }

    public function test_lending_and_hr_guards_reject_an_unrecognized_saved_result_action(): void
    {
        $this->assertFalse(app(LendingActions::class)->authorizeResult(
            $this->forgedScope(AuthorizedLendingScope::class, 'lending.applications.export'), [],
            ['application' => ['id' => 1]]));
        $this->assertFalse(app(HrActions::class)->authorizeResult(
            $this->forgedScope(AuthorizedHrScope::class, 'hr.employees.export'), [],
            ['employee' => ['id' => 1]]));
    }

    private function helpdeskScope(string $action): AuthorizedHelpdeskScope
    {
        return AuthorizedHelpdeskScope::fromVerifiedExchange([
            'id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'helpdesk',
            'topic' => 'helpdesk.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 11, 'organization_id' => 7,
                'application' => 'helpdesk', 'action' => $action, 'auth_version' => 0, 'token_id' => 43],
                'command' => ['input' => [], 'operation_id' => (string) Str::uuid()]],
        ], fn (): bool => true);
    }

    public function test_helpdesk_saved_queue_and_agent_results_stay_within_the_verified_organization(): void
    {
        $ownQueue = HelpdeskQueue::create(['organization_id' => 7, 'code' => 'own', 'name' => 'Own']);
        $otherQueue = HelpdeskQueue::create(['organization_id' => 8, 'code' => 'other', 'name' => 'Other']);
        $ownAgent = HelpdeskQueueAgent::create(['organization_id' => 7, 'queue_id' => $ownQueue->id,
            'platform_user_id' => 11]);
        $otherAgent = HelpdeskQueueAgent::create(['organization_id' => 8, 'queue_id' => $otherQueue->id,
            'platform_user_id' => 12]);
        $guard = app(HelpdeskActions::class);
        DB::transaction(function () use ($guard, $ownQueue, $otherQueue, $ownAgent, $otherAgent): void {
            $queues = $this->helpdeskScope('helpdesk.queues.detail');
            $this->assertTrue($guard->authorizeResult($queues, ['id' => $ownQueue->id],
                ['queue' => ['id' => $ownQueue->id]]));
            $this->assertFalse($guard->authorizeResult($queues, ['id' => $otherQueue->id],
                ['queue' => ['id' => $otherQueue->id]]));
            $agents = $this->helpdeskScope('helpdesk.agents.list');
            $this->assertTrue($guard->authorizeResult($agents, [], ['data' => [['id' => $ownAgent->id]]]));
            $this->assertFalse($guard->authorizeResult($agents, [], ['data' => [['id' => $otherAgent->id]]]));
        });
    }

    public function test_hr_employee_subject_must_be_a_positive_bound_platform_identity(): void
    {
        $method = new ReflectionMethod(RemoteCommandCoordinator::class, 'subject');
        $coordinator = app(RemoteCommandCoordinator::class);
        $this->assertSame(23, $method->invoke($coordinator, 'hr.employees.create',
            ['linked_platform_user_id' => 23]));
        foreach ([[], ['linked_platform_user_id' => 0], ['linked_platform_user_id' => '23']] as $input) {
            try {
                $method->invoke($coordinator, 'hr.employees.create', $input);
                $this->fail('An unbound HR employee subject was accepted.');
            } catch (HttpException $error) {
                $this->assertSame(422, $error->getStatusCode());
            }
        }
    }
}
