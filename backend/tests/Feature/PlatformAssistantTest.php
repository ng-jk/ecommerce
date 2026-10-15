<?php

namespace Tests\Feature;

use App\Domain\Assistant\FunctionGemma;
use App\Domain\Assistant\ToolRegistry;
use App\Models\Operation;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\PlatformConversation;
use App\Models\PlatformUser;
use App\Modules\Builder\Models\Page;
use App\Modules\Crm\Models\Activity;
use App\Modules\Crm\Models\Deal;
use App\Modules\Crm\Models\Lead;
use App\Modules\Crm\Models\Stage;
use App\Modules\Erp\Models\Account;
use App\Modules\Erp\Models\Journal;
use App\Modules\Helpdesk\Models\HelpdeskQueue;
use App\Modules\Helpdesk\Models\HelpdeskQueueAgent;
use App\Modules\Helpdesk\Models\HelpdeskTicket;
use App\Modules\Hr\Models\HrEmployee;
use App\Modules\Hr\Models\HrLeaveRequest;
use App\Modules\Hr\Models\HrLeaveType;
use App\Modules\Insights\Models\InsightDashboard;
use App\Modules\Insights\Models\InsightDataset;
use App\Modules\Insights\Models\InsightReport;
use App\Modules\Learning\Models\LearningCourse;
use App\Modules\Learning\Models\LearningEnrollment;
use App\Modules\Lending\Models\LendingApplication;
use App\Modules\Lending\Models\LendingProduct;
use App\Modules\Platform\PlatformAssistantActions;
use App\Modules\Platform\PlatformToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\TestCase;

class PlatformAssistantTest extends TestCase
{
    use RefreshDatabase;

    private function turn(PlatformUser $user, array $input, ?array $prior = null, string $receipt = 'receipt'): array
    {
        if ($prior) {
            $input += ['conversation_id' => $prior['conversation_id'], 'conversation_version' => $prior['conversation_version']];
        }
        $operation = new Operation(['platform_user_id' => $user->id, 'auth_version' => $user->auth_version,
            'receipt_hash' => hash('sha256', $receipt), 'payload' => ['input' => $input]]);

        return DB::transaction(fn () => app(PlatformAssistantActions::class)->run($operation, $user));
    }

    private function workspace(PlatformUser $user): array
    {
        $preview = $this->turn($user, ['action' => 'standaloneCreateOrganization', 'data' => ['code' => 'workspace-'.fake()->unique()->numberBetween(100, 999999), 'name' => 'Workspace']]);

        return $this->turn($user, ['confirm' => true], $preview);
    }

    private function denied(callable $call, int $status): void
    {
        try {
            $call();
            $this->fail('Expected access rejection.');
        } catch (HttpExceptionInterface $error) {
            $this->assertSame($status, $error->getStatusCode());
        }
    }

    public function test_discovery_exposes_standalone_capabilities_without_password_or_shop_actions(): void
    {
        $user = PlatformUser::factory()->create();
        $result = $this->turn($user, ['discover' => true]);
        $names = array_column($result['available_actions'], 'name');
        $this->assertContains('standaloneCreateOrganization', $names);
        $this->assertContains('platformMe', $names);
        $this->assertContains('platformLogout', $names);
        $this->assertNotContains('platformLogin', $names);
        $this->assertNotContains('checkout', $names);
        $this->assertDatabaseCount('platform_conversations', 0);
        app(PlatformAssistantActions::class)->authorizeResult($user, $result);
        $actions = config('platform.actions');
        $actions['platform.organization.create'] = false;
        config(['platform.actions' => $actions]);
        $this->denied(fn () => app(PlatformToolRegistry::class)->find('standaloneCreateOrganization', $user), 403);
    }

    public function test_remote_discovery_uses_each_models_enum_and_requires_provisioning(): void
    {
        $cases = [
            ['crm.leads.list', 'status', Lead::options()],
            ['crm.deals.list', 'status', Deal::options()],
            ['crm.stages.list', 'outcome', Stage::options()],
            ['crm.activities.list', 'type', Activity::options()],
            ['helpdesk.queues.list', 'status', HelpdeskQueue::options()],
            ['helpdesk.agents.list', 'status', HelpdeskQueueAgent::options()],
            ['helpdesk.tickets.requester.list', 'status', HelpdeskTicket::options()],
            ['learning.courses.list', 'status', LearningCourse::options()],
            ['learning.courses.create', 'access_mode', LearningCourse::options('access_mode')],
            ['learning.enrollments.list', 'status', LearningEnrollment::options()],
            ['builder.pages.list', 'status', Page::options()],
            ['insights.datasets.list', 'status', InsightDataset::options()],
            ['insights.datasets.list', 'visibility', InsightDataset::options('visibility')],
            ['insights.datasets.create', 'source_kind', InsightDataset::options('source_kind')],
            ['insights.datasets.create', 'type', InsightDataset::options('type')],
            ['insights.datasets.query', 'aggregate', InsightDataset::options('aggregate')],
            ['insights.reports.list', 'status', InsightReport::options()],
            ['insights.reports.list', 'visibility', InsightReport::options('visibility')],
            ['insights.dashboards.list', 'status', InsightDashboard::options()],
            ['insights.dashboards.list', 'visibility', InsightDashboard::options('visibility')],
            ['erp.accounts.create', 'type', Account::options()],
            ['erp.journals.list', 'status', Journal::options()],
            ['hr.employees.list', 'status', HrEmployee::options()],
            ['hr.leave.types.list', 'status', HrLeaveType::options()],
            ['hr.leave.mine.list', 'status', HrLeaveRequest::options()],
            ['hr.leave.owner.decide', 'decision', array_intersect_key(HrLeaveRequest::options(), array_flip(['approved', 'rejected']))],
            ['lending.products.list', 'status', LendingProduct::options()],
            ['lending.applications.list', 'status', LendingApplication::options()],
            ['lending.reviews.list', 'status', LendingApplication::options()],
            ['lending.reviews.decide', 'decision', array_intersect_key(LendingApplication::options(), array_flip(['approved', 'rejected']))],
        ];
        $tools = [];
        foreach ($cases as [$action, $field, $options]) {
            $service = explode('.', $action)[0];
            config(['platform.applications.'.$service => ['available' => true, 'provisioned' => true]]);
            $tools[] = ['name' => $action, 'action' => 'standalone.'.$action, 'callable' => true,
                'path' => '/api/v1/platform/organizations/{organization_id}/'.$service,
                'parameters' => ['properties' => [$field => ['type' => 'string']]]];
        }
        $registry = \Mockery::mock(ToolRegistry::class);
        $registry->shouldReceive('all')->andReturn($tools);
        $this->app->instance(ToolRegistry::class, $registry);
        $actor = PlatformUser::factory()->create();
        $available = app(PlatformToolRegistry::class)->available($actor);
        $this->assertCount(count($cases), $available);
        foreach ($cases as $index => [$action, $field, $options]) {
            $this->assertSame($options, $available[$index]['parameters']['properties'][$field]['options']);
            $this->assertSame(array_keys($options), $available[$index]['parameters']['properties'][$field]['enum']);
        }
        config(['platform.applications.learning.provisioned' => false]);
        $this->assertCount(count($cases) - 3, app(PlatformToolRegistry::class)->available($actor));
    }

    public function test_create_requires_separate_confirmation_and_completed_replay_has_one_effect(): void
    {
        $user = PlatformUser::factory()->create();
        $draft = $this->turn($user, ['action' => 'standaloneCreateOrganization', 'data' => ['code' => 'unique-work']]);
        $this->assertSame('needs_input', $draft['status']);
        $preview = $this->turn($user, ['data' => ['name' => 'My workspace']], $draft);
        $this->assertSame('needs_confirmation', $preview['status']);
        $this->assertDatabaseCount('organizations', 0);
        app(PlatformAssistantActions::class)->authorizeResult($user, $preview);
        $done = $this->turn($user, ['confirm' => true], $preview);
        $this->assertSame('platform.organization.create', $done['executed_action']);
        $this->assertSame($done, $this->turn($user, ['confirm' => true], $done));
        $this->assertDatabaseCount('organizations', 1);
        $this->assertDatabaseHas('organization_memberships', ['platform_user_id' => $user->id, 'role' => 'owner']);
        $this->assertStringNotContainsString('My workspace', DB::table('platform_conversations')->value('draft'));
    }

    public function test_read_executes_same_handler_and_cached_result_is_denied_after_membership_revocation(): void
    {
        $user = PlatformUser::factory()->create();
        $workspace = $this->workspace($user);
        $id = $workspace['api_result']['organization']['id'];
        $detail = $this->turn($user, ['action' => 'standaloneOrganization', 'data' => ['id' => $id]]);
        $this->assertSame($id, $detail['api_result']['organization']['id']);
        OrganizationMembership::where('platform_user_id', $user->id)->update(['status' => 'revoked']);
        $this->denied(fn () => $this->turn($user, [], $detail), 404);
        $this->denied(fn () => app(PlatformAssistantActions::class)->authorizeResult($user, $detail), 404);
    }

    public function test_rename_preview_captures_server_version_and_stale_confirmation_cannot_overwrite(): void
    {
        $user = PlatformUser::factory()->create();
        $workspace = $this->workspace($user);
        $id = $workspace['api_result']['organization']['id'];
        $preview = $this->turn($user, ['action' => 'standaloneUpdateOrganization', 'data' => ['id' => $id, 'name' => 'New name']]);
        $this->assertSame(0, $preview['preview']['input']['expected_version']);
        app(PlatformAssistantActions::class)->authorizeResult($user, $preview);
        Organization::findOrFail($id)->update(['version' => 1, 'name' => 'Concurrent name']);
        $this->denied(fn () => $this->turn($user, ['confirm' => true], $preview), 409);
        $this->assertDatabaseHas('organizations', ['id' => $id, 'name' => 'Concurrent name']);
    }

    public function test_conversation_receipt_version_expiry_and_confirmation_guards(): void
    {
        $user = PlatformUser::factory()->create();
        $preview = $this->turn($user, ['action' => 'standaloneCreateOrganization', 'data' => ['code' => 'example', 'name' => 'Example']]);
        $this->denied(fn () => $this->turn($user, ['confirm' => true], $preview, 'wrong'), 404);
        $this->denied(fn () => $this->turn($user, ['conversation_version' => 0], $preview), 409);
        $this->denied(fn () => $this->turn($user, ['confirm' => true, 'data' => ['name' => 'Changed']], $preview), 409);
        PlatformConversation::query()->update(['auth_version' => 999]);
        $this->denied(fn () => $this->turn($user, [], $preview), 403);
        PlatformConversation::query()->update(['auth_version' => $user->auth_version, 'expires_at' => now()->subSecond()]);
        $this->denied(fn () => $this->turn($user, [], $preview), 410);
        $this->denied(fn () => app(PlatformAssistantActions::class)->authorizeResult($user, $preview), 410);
        $this->assertDatabaseCount('organizations', 0);
    }

    public function test_language_proposal_requires_confirmation_and_cannot_switch_pending_action(): void
    {
        $user = PlatformUser::factory()->create();
        $this->mock(FunctionGemma::class)->shouldReceive('propose')->once()->andReturn(['name' => 'platformMe', 'arguments' => []]);
        $preview = $this->turn($user, ['message' => 'Show my identity']);
        $this->assertSame('needs_confirmation', $preview['status']);
        $result = $this->turn($user, ['confirm' => true], $preview);
        $this->assertSame($user->id, $result['api_result']['user']['id']);
        $this->assertSame($result, $this->turn($user, [], $result));
        $draft = $this->turn($user, ['action' => 'standaloneCreateOrganization', 'data' => []]);
        $this->mock(FunctionGemma::class)->shouldReceive('propose')->once()->andReturn(['name' => 'platformLogout', 'arguments' => []]);
        $this->expectException(ValidationException::class);
        $this->turn($user, ['message' => 'Log out instead'], $draft);
    }

    public function test_unknown_missing_changed_actions_and_forged_versions_are_validation_failures(): void
    {
        $user = PlatformUser::factory()->create();
        $draft = $this->turn($user, ['action' => 'standaloneCreateOrganization', 'data' => []]);
        foreach ([[['data' => []], null], [['action' => 'platformMe'], $draft],
            [['action' => 'standaloneCreateOrganization', 'data' => ['code' => 'hello', 'name' => 'Hello', 'expected_version' => 0]], null]] as [$input, $prior]) {
            try {
                $this->turn($user, $input, $prior);
                $this->fail('Invalid input accepted.');
            } catch (ValidationException $error) {
                $this->assertNotEmpty($error->errors());
            }
        }
        $this->denied(fn () => $this->turn($user, ['action' => 'checkout']), 403);
        $this->assertDatabaseCount('organizations', 0);
    }

    public function test_membership_preview_injects_current_version_and_result_rechecks_current_owner(): void
    {
        $owner = PlatformUser::factory()->create();
        $workspace = $this->workspace($owner);
        $id = $workspace['api_result']['organization']['id'];
        $recipient = PlatformUser::factory()->create();
        $member = OrganizationMembership::factory()->create(['organization_id' => $id, 'user_id' => null,
            'platform_user_id' => $recipient->id, 'role' => 'member', 'status' => 'active']);
        $preview = $this->turn($owner, ['action' => 'standaloneChangeMembershipRole', 'data' => ['id' => $id, 'membership_id' => $member->id, 'role' => 'admin']]);
        $this->assertSame($member->version, $preview['preview']['input']['expected_version']);
        $done = $this->turn($owner, ['confirm' => true], $preview);
        $this->assertSame('admin', $member->fresh()->role);
        app(PlatformAssistantActions::class)->authorizeResult($owner, $done);
        OrganizationMembership::where('platform_user_id', $owner->id)->update(['role' => 'member']);
        $this->denied(fn () => app(PlatformAssistantActions::class)->authorizeResult($owner, $done), 403);
    }

    public function test_disabled_or_version_changed_principal_cannot_retrieve_stored_assistant_results(): void
    {
        $user = PlatformUser::factory()->create();
        $result = $this->turn($user, ['action' => 'platformMe']);
        $user->update(['account_status' => PlatformUser::Disabled]);
        $this->denied(fn () => $this->turn($user, [], $result), 403);
        $this->denied(fn () => app(PlatformAssistantActions::class)->authorizeResult($user, $result), 403);
        $this->assertNotEmpty(PlatformConversation::options());
    }

    public function test_assistant_refuses_execution_outside_worker_transaction(): void
    {
        $user = PlatformUser::factory()->create();
        DB::rollBack();
        try {
            $this->expectException(\LogicException::class);
            app(PlatformAssistantActions::class)->run(new Operation, $user);
        } finally {
            DB::beginTransaction();
        }
    }
}
