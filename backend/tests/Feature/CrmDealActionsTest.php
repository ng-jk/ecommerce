<?php

namespace Tests\Feature;

use App\Modules\Crm\AuthorizedCrmScope;
use App\Modules\Crm\CrmActions;
use App\Modules\Crm\CrmDealActions;
use App\Modules\Crm\Models\Activity;
use App\Modules\Crm\Models\Company;
use App\Modules\Crm\Models\Contact;
use App\Modules\Crm\Models\Deal;
use App\Modules\Crm\Models\Pipeline;
use App\Modules\Crm\Models\Stage;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class CrmDealActionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/crm', '--force' => true]);
    }

    private function scope(string $action, array $input = [], int $organizationId = 7, ?int $subjectId = null): AuthorizedCrmScope
    {
        $scope = ['platform_user_id' => 11, 'organization_id' => $organizationId,
            'application' => 'crm', 'action' => $action, 'auth_version' => 0, 'token_id' => 43];
        if ($subjectId !== null) {
            $scope['subject_platform_user_id'] = $subjectId;
        }
        $envelope = ['id' => 'e37a3e1e-62df-4b13-bbbf-fc0963f5c189',
            'source' => 'platform', 'destination' => 'crm', 'topic' => 'crm.command', 'version' => 1,
            'payload' => ['scope' => $scope, 'command' => [
                'input' => $input, 'operation_id' => '3b630bea-44aa-4567-91c7-d61d70161802']]];

        return AuthorizedCrmScope::fromVerifiedExchange($envelope, fn () => true);
    }

    private function runAction(string $action, array $input = [], ?int $id = null, int $organizationId = 7,
        ?int $subjectId = null): array
    {
        return app(CrmActions::class)->execute($this->scope($action, $input, $organizationId, $subjectId), $input, $id);
    }

    private function pipeline(string $code = 'primary', int $organizationId = 7): array
    {
        return $this->runAction('crm.pipelines.create', ['code' => $code, 'name' => ucfirst($code)], null, $organizationId)['pipeline'];
    }

    private function stage(int $pipelineId, string $code, int $position, string $outcome = Stage::Open,
        int $organizationId = 7): array
    {
        return $this->runAction('crm.stages.create', ['pipeline_id' => $pipelineId, 'code' => $code,
            'name' => ucfirst($code), 'position' => $position, 'outcome' => $outcome], null, $organizationId)['stage'];
    }

    private function deal(int $pipelineId, int $stageId, ?int $assignee = null,
        int $organizationId = 7): array
    {
        return $this->runAction('crm.deals.create', ['pipeline_id' => $pipelineId, 'stage_id' => $stageId,
            'title' => 'A deal', 'company_id' => null, 'contact_id' => null,
            'assignee_platform_user_id' => $assignee, 'amount_minor' => 12500, 'currency' => 'USD'],
            null, $organizationId, $assignee)['deal'];
    }

    private function conflict(callable $action): void
    {
        try {
            $action();
            $this->fail('Conflict accepted.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
    }

    private function invalid(string $field, callable $action): void
    {
        try {
            $action();
            $this->fail('Invalid input accepted.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey($field, $error->errors());
        }
    }

    public function test_pipeline_and_stage_directories_use_scoped_pagination_options_and_immutable_order(): void
    {
        $one = $this->pipeline('ONE');
        $two = $this->pipeline('two');
        $other = $this->pipeline('one', 8);
        $this->assertSame('one', $one['code']);
        $this->assertSame([$one['id']], array_column($this->runAction('crm.pipelines.list', ['code' => 'ONE'])['data'], 'id'));
        $page = $this->runAction('crm.pipelines.list', ['page' => '2', 'per_page' => '1']);
        $this->assertSame([$two['id']], array_column($page['data'], 'id'));
        $this->assertSame(2, $page['meta']['total']);
        $this->assertArrayNotHasKey('organization_id', $page['data'][0]);
        $this->assertSame($one, $this->runAction('crm.pipelines.detail', [], $one['id'])['pipeline']);
        $changed = $this->runAction('crm.pipelines.update', ['name' => 'Primary', 'expected_version' => 0], $one['id'])['pipeline'];
        $this->assertSame(1, $changed['version']);
        $this->invalid('code', fn () => $this->pipeline('ONE'));
        $this->conflict(fn () => $this->runAction('crm.pipelines.update', ['name' => 'Stale', 'expected_version' => 0], $one['id']));
        $this->expectException(ModelNotFoundException::class);
        $this->runAction('crm.pipelines.detail', [], $other['id']);
    }

    public function test_stage_order_and_deal_transition_are_versioned_and_terminal(): void
    {
        $pipeline = $this->pipeline();
        $first = $this->stage($pipeline['id'], 'new', 10);
        $second = $this->stage($pipeline['id'], 'proposal', 20);
        $won = $this->stage($pipeline['id'], 'won', 30, Stage::Won);
        $lost = $this->stage($pipeline['id'], 'lost', 40, Stage::Lost);
        $this->assertSame(Stage::options(), $this->runAction('crm.stages.list', ['pipeline_id' => $pipeline['id']])['meta']['options']['outcome']);
        $this->assertSame([$won['id']], array_column($this->runAction('crm.stages.list',
            ['pipeline_id' => $pipeline['id'], 'outcome' => 'won'])['data'], 'id'));
        $this->assertSame($first, $this->runAction('crm.stages.detail', [], $first['id'])['stage']);
        $renamed = $this->runAction('crm.stages.update', ['name' => 'Intake', 'expected_version' => 0], $first['id'])['stage'];
        $this->assertSame(1, $renamed['version']);
        $this->conflict(fn () => $this->runAction('crm.stages.update',
            ['name' => 'Again', 'expected_version' => 0], $first['id']));
        $this->invalid('code', fn () => $this->stage($pipeline['id'], 'new', 11));
        $this->invalid('position', fn () => $this->stage($pipeline['id'], 'other', 20));
        $this->conflict(fn () => $this->stage($pipeline['id'], 'late-open', 35));
        $this->conflict(fn () => $this->stage($pipeline['id'], 'early-won', 5, Stage::Won));

        $deal = $this->deal($pipeline['id'], $first['id'], 19);
        $this->assertSame(19, $deal['assignee_platform_user_id']);
        $this->assertSame(12500, $deal['amount_minor']);
        $this->assertSame(Deal::options(), $this->runAction('crm.deals.list')['meta']['options']['status']);
        $this->assertSame([$deal['id']], array_column($this->runAction('crm.deals.list',
            ['pipeline_id' => $pipeline['id'], 'stage_id' => $first['id'], 'assignee_platform_user_id' => 19])['data'], 'id'));
        $this->assertSame($deal, $this->runAction('crm.deals.detail', [], $deal['id'])['deal']);
        $changed = $this->runAction('crm.deals.update', ['title' => 'Changed', 'company_id' => null,
            'contact_id' => null, 'assignee_platform_user_id' => null, 'amount_minor' => 0,
            'currency' => 'MYR', 'expected_version' => 0], $deal['id'])['deal'];
        $this->assertSame(1, $changed['version']);
        $this->assertNull($changed['assignee_platform_user_id']);
        $this->conflict(fn () => $this->runAction('crm.deals.advance',
            ['stage_id' => $second['id'], 'expected_version' => 0], $deal['id']));
        $forward = $this->runAction('crm.deals.advance',
            ['stage_id' => $second['id'], 'expected_version' => 1], $deal['id'])['deal'];
        $this->assertSame('open', $forward['status']);
        $this->conflict(fn () => $this->runAction('crm.deals.advance',
            ['stage_id' => $first['id'], 'expected_version' => 2], $deal['id']));
        $closed = $this->runAction('crm.deals.advance',
            ['stage_id' => $won['id'], 'expected_version' => 2], $deal['id'])['deal'];
        $this->assertSame('won', $closed['status']);
        $this->conflict(fn () => $this->runAction('crm.deals.advance',
            ['stage_id' => $lost['id'], 'expected_version' => 3], $deal['id']));
        $this->conflict(fn () => $this->runAction('crm.deals.update', ['title' => 'Closed',
            'company_id' => null, 'contact_id' => null, 'assignee_platform_user_id' => null,
            'amount_minor' => 0, 'currency' => 'MYR', 'expected_version' => 3], $deal['id']));
    }

    public function test_cross_organization_references_assignment_scope_and_validation_fail_closed(): void
    {
        $one = $this->pipeline();
        $first = $this->stage($one['id'], 'new', 10);
        $other = $this->pipeline('other', 8);
        $otherStage = $this->stage($other['id'], 'other-new', 10, Stage::Open, 8);
        try {
            $this->deal($one['id'], $otherStage['id']);
            $this->fail('Cross-organization stage accepted.');
        } catch (ModelNotFoundException) {
            $this->assertTrue(true);
        }
        $this->conflict(fn () => $this->deal($one['id'], $this->stage($one['id'], 'won', 20, Stage::Won)['id']));
        try {
            $this->runAction('crm.deals.detail', [], $this->deal($other['id'], $otherStage['id'], null, 8)['id']);
            $this->fail('Cross-organization deal visible.');
        } catch (ModelNotFoundException) {
            $this->assertTrue(true);
        }
        foreach ([
            ['crm.deals.create', ['assignee_platform_user_id' => 19], null],
            ['crm.deals.create', ['assignee_platform_user_id' => 19], 20],
            ['crm.deals.detail', [], 19],
        ] as [$action, $input, $subject]) {
            try {
                $this->scope($action, $input, 7, $subject);
                $this->fail('Invalid assignment scope accepted.');
            } catch (InvalidArgumentException) {
                $this->assertTrue(true);
            }
        }
        $deal = $this->deal($one['id'], $first['id']);
        $this->invalid('stage_id', fn () => $this->runAction('crm.deals.list', ['stage_id' => $first['id']]));
        $this->invalid('amount_minor', fn () => $this->runAction('crm.deals.create', [
            'pipeline_id' => $one['id'], 'stage_id' => $first['id'], 'title' => 'Bad',
            'company_id' => null, 'contact_id' => null, 'assignee_platform_user_id' => null,
            'amount_minor' => 1.5, 'currency' => 'USD']));
        $this->invalid('currency', fn () => $this->runAction('crm.deals.update', [
            'title' => 'Bad', 'company_id' => null, 'contact_id' => null,
            'assignee_platform_user_id' => null, 'amount_minor' => 100,
            'currency' => 'usd', 'expected_version' => 0], $deal['id']));
        $this->invalid('role', fn () => $this->runAction('crm.deals.update', ['role' => 'owner'], $deal['id']));
        $this->assertSame(0, Deal::find($deal['id'])->version);
    }

    public function test_deal_company_contact_references_and_append_only_activities(): void
    {
        $pipeline = $this->pipeline();
        $stage = $this->stage($pipeline['id'], 'new', 10);
        $company = Company::factory()->create(['organization_id' => 7]);
        $contact = Contact::factory()->create([
            'organization_id' => 7, 'company_id' => $company->id]);
        $otherCompany = Company::factory()->create(['organization_id' => 8]);
        $secondCompany = Company::factory()->create(['organization_id' => 7]);
        $this->conflict(fn () => $this->runAction('crm.deals.create', [
            'pipeline_id' => $pipeline['id'], 'stage_id' => $stage['id'], 'title' => 'Mismatch',
            'company_id' => $secondCompany->id, 'contact_id' => $contact->id, 'assignee_platform_user_id' => null,
            'amount_minor' => 100, 'currency' => 'USD']));
        $linked = $this->runAction('crm.deals.create', ['pipeline_id' => $pipeline['id'],
            'stage_id' => $stage['id'], 'title' => 'Linked', 'company_id' => $company->id,
            'contact_id' => $contact->id, 'assignee_platform_user_id' => null,
            'amount_minor' => 100, 'currency' => 'USD'])['deal'];
        $this->assertSame($contact->id, $linked['contact_id']);
        try {
            $this->runAction('crm.deals.create', ['pipeline_id' => $pipeline['id'],
                'stage_id' => $stage['id'], 'title' => 'Wrong tenant', 'company_id' => $otherCompany->id,
                'contact_id' => null, 'assignee_platform_user_id' => null,
                'amount_minor' => 100, 'currency' => 'USD']);
            $this->fail('Cross-organization company accepted.');
        } catch (ModelNotFoundException) {
            $this->assertTrue(true);
        }
        $deal = $this->deal($pipeline['id'], $stage['id']);
        $activity = $this->runAction('crm.activities.create', ['deal_id' => $deal['id'],
            'type' => Activity::Call, 'summary' => 'Called customer',
            'occurred_at' => '2026-10-13T10:00:00+00:00'])['activity'];
        $this->assertSame(Activity::options(), $this->runAction('crm.activities.detail', [], $activity['id'])['options']['type']);
        $this->assertSame([$activity['id']], array_column($this->runAction('crm.activities.list',
            ['deal_id' => $deal['id'], 'type' => Activity::Call])['data'], 'id'));
        $this->assertSame(11, Activity::find($activity['id'])->created_by_platform_user_id);
        $this->assertSame($activity['id'], Deal::find($deal['id'])->activities->first()->id);
        $this->invalid('occurred_at', fn () => $this->runAction('crm.activities.create', [
            'deal_id' => $deal['id'], 'type' => Activity::Note, 'summary' => 'Bad',
            'occurred_at' => 'tomorrow']));
        $this->invalid('summary', fn () => $this->runAction('crm.activities.create', [
            'deal_id' => $deal['id'], 'type' => Activity::Note, 'summary' => ' ',
            'occurred_at' => '2026-10-13T10:00:00+00:00']));
    }

    public function test_factories_relations_and_unrelated_database_errors_preserve_their_cause(): void
    {
        $pipeline = Pipeline::factory()->create(['organization_id' => 7]);
        $stage = Stage::factory()->create(['organization_id' => 7, 'pipeline_id' => $pipeline->id]);
        $deal = Deal::factory()->create(['organization_id' => 7, 'pipeline_id' => $pipeline->id,
            'stage_id' => $stage->id]);
        $activity = Activity::factory()->create(['organization_id' => 7, 'deal_id' => $deal->id]);
        $this->assertSame($stage->id, $pipeline->stages->first()->id);
        $this->assertSame($pipeline->id, $stage->pipeline->id);
        $this->assertSame($pipeline->id, $deal->pipeline->id);
        $this->assertSame($stage->id, $deal->stage->id);
        $this->assertSame($deal->id, $activity->deal->id);
        $this->assertSame($activity->id, $deal->activities->first()->id);
        Pipeline::creating(fn () => DB::table('crm_missing_table')->insert(['id' => 1]));
        try {
            $this->pipeline('broken');
            $this->fail('Unrelated database error was accepted.');
        } catch (QueryException $error) {
            $this->assertStringContainsString('crm_missing_table', $error->getMessage());
        }
    }

    public function test_dispatcher_rechecks_target_scope_when_input_is_changed_after_authorization(): void
    {
        $pipeline = $this->pipeline();
        $stage = $this->stage($pipeline['id'], 'new', 10);
        $input = ['pipeline_id' => $pipeline['id'], 'stage_id' => $stage['id'],
            'title' => 'Tampered', 'company_id' => null, 'contact_id' => null,
            'assignee_platform_user_id' => 19, 'amount_minor' => 100, 'currency' => 'USD'];
        $scope = $this->scope('crm.deals.create', [...$input, 'assignee_platform_user_id' => null]);
        try {
            app(CrmDealActions::class)->execute($scope, $input, null);
            $this->fail('Changed assignee accepted.');
        } catch (HttpException $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
        try {
            app(CrmDealActions::class)->execute($this->scope('crm.unknown.list'), [], null);
            $this->fail('Unknown CRM action accepted.');
        } catch (HttpException $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
        $this->assertSame(0, Deal::count());
    }

    public function test_stage_unique_constraint_still_handles_a_race_after_the_pipeline_check(): void
    {
        $pipeline = $this->pipeline();
        Stage::creating(function (Stage $stage): void {
            DB::table('crm_stages')->insert(['organization_id' => $stage->organization_id,
                'pipeline_id' => $stage->pipeline_id, 'created_by_platform_user_id' => 11,
                'updated_by_platform_user_id' => 11, 'code' => $stage->code,
                'name' => 'Concurrent', 'position' => $stage->position, 'outcome' => Stage::Open,
                'version' => 0, 'created_at' => now(), 'updated_at' => now()]);
        });
        $this->invalid('code', fn () => $this->stage($pipeline['id'], 'race', 10));
        $this->assertSame(0, Stage::count());
    }
}
