<?php

namespace Tests\Feature;

use App\Models\ServiceDelivery;
use App\Modules\Insights\AuthorizedInsightsScope;
use App\Modules\Insights\InsightsActions;
use App\Modules\Insights\InsightsCommandHandler;
use App\Modules\Insights\Models\InsightDashboard as Dashboard;
use App\Modules\Insights\Models\InsightDataset as Dataset;
use App\Modules\Insights\Models\InsightReport as Report;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\TestCase;

class InsightsTest extends TestCase
{
    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
        $migration = require database_path('migrations/services/insights/2026_10_13_032352_create_insights_tables.php');
        $migration->down();
        $migration->up();
        if (! Schema::hasTable('service_inboxes')) {
            (require database_path('migrations/2026_10_13_015300_create_service_exchange_tables.php'))->up();
        }
        foreach (['service_inboxes', 'service_deliveries'] as $table) {
            DB::table($table)->delete();
        }
    }

    private function message(string $action, array $input = [], ?int $id = null, int $user = 7, int $org = 11): array
    {
        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'insights', 'topic' => 'insights.command', 'version' => 1,
            'payload' => ['scope' => ['organization_id' => $org, 'platform_user_id' => $user, 'token_id' => 1, 'auth_version' => 0,
                'application' => 'insights', 'action' => 'insights.'.$action],
                'command' => ['operation_id' => (string) Str::uuid(), 'input' => $input, ...($id === null ? [] : ['id' => $id])]]];
    }

    private function runAction(string $action, array $input = [], ?int $id = null, int $user = 7, int $org = 11): array
    {
        $scope = AuthorizedInsightsScope::fromVerifiedExchange($this->message($action, $input, $id, $user, $org), fn (): bool => true);

        return DB::transaction(fn () => app(InsightsActions::class)->execute($scope, $input, $id));
    }

    private function denied(callable $run, int $status): void
    {
        try {
            $run();
            $this->fail('Expected rejection.');
        } catch (HttpExceptionInterface $error) {
            $this->assertSame($status, $error->getStatusCode());
        }
    }

    private function dataset(): Dataset
    {
        $data = $this->runAction('datasets.create', ['name' => 'Measurements', 'visibility' => 'private', 'schema' => [
            ['name' => 'team', 'type' => 'string'], ['name' => 'value', 'type' => 'integer'], ['name' => 'ready', 'type' => 'boolean']]]);

        return Dataset::findOrFail($data['resource']['id']);
    }

    private function rows(Dataset $dataset): void
    {
        $this->runAction('datasets.replace', ['expected_version' => $dataset->refresh()->version, 'rows' => [
            ['team' => 'Alpha', 'value' => 10, 'ready' => true], ['team' => 'Alpha', 'value' => 20, 'ready' => true],
            ['team' => 'Beta', 'value' => 30, 'ready' => false]]], $dataset->id);
    }

    public function test_typed_queries_exact_averages_reports_dashboards_and_freshness(): void
    {
        $dataset = $this->dataset();
        $this->rows($dataset);
        $this->assertSame(1, $this->runAction('datasets.list', ['page' => '1', 'per_page' => '1'])['meta']['total']);
        $this->assertArrayNotHasKey('rows', $this->runAction('datasets.detail', [], $dataset->id)['resource']);
        $sum = ['metric' => ['aggregate' => 'sum', 'column' => 'value'], 'group_by' => 'team', 'limit' => 1];
        $result = $this->runAction('datasets.query', ['definition' => $sum], $dataset->id);
        $this->assertSame(30, $result['data'][0]['value']);
        $this->assertTrue($result['meta']['truncated']);
        $this->assertSame(1, $result['freshness']['dataset_version']);
        $this->assertSame('manual', $result['freshness']['source_kind']);
        $avg = $this->runAction('datasets.query', ['definition' => ['metric' => ['aggregate' => 'avg', 'column' => 'value'],
            'filters' => [['column' => 'ready', 'operator' => 'eq', 'value' => true], ['column' => 'value', 'operator' => 'gte', 'value' => 10],
                ['column' => 'value', 'operator' => 'lte', 'value' => 20]]]], $dataset->id);
        $this->assertSame(['numerator' => 30, 'denominator' => 2], $avg['data'][0]['value']);
        $this->assertSame(3, $this->runAction('datasets.query', ['definition' => ['metric' => ['aggregate' => 'count']]], $dataset->id)['data'][0]['value']);
        $report = $this->runAction('reports.create', ['name' => 'Totals', 'visibility' => 'organization', 'dataset_id' => $dataset->id, 'definition' => $sum])['resource'];
        $dashboard = $this->runAction('dashboards.create', ['name' => 'Overview', 'visibility' => 'organization', 'report_ids' => [$report['id']]])['resource'];
        $this->assertSame(1, $this->runAction('reports.list')['meta']['total']);
        $this->assertSame(1, $this->runAction('dashboards.list')['meta']['total']);
        $this->assertSame($dataset->id, $this->runAction('reports.detail', [], $report['id'])['resource']['dataset_id']);
        $this->assertSame([$report['id']], $this->runAction('dashboards.detail', [], $dashboard['id'])['resource']['report_ids']);
        $this->assertSame(30, $this->runAction('reports.run', [], $report['id'])['data'][0]['value']);
        $this->assertCount(1, $this->runAction('dashboards.render', [], $dashboard['id'])['reports']);
        $this->runAction('reports.update', ['expected_version' => 0, 'name' => 'New total', 'status' => 'active', 'visibility' => 'organization', 'definition' => $sum], $report['id']);
        $this->runAction('dashboards.update', ['expected_version' => 0, 'name' => 'New view', 'status' => 'active', 'visibility' => 'organization', 'report_ids' => [$report['id']]], $dashboard['id']);
        $this->denied(fn () => $this->runAction('reports.run', [], $report['id'], 8), 404);
        $this->denied(fn () => $this->runAction('dashboards.render', [], $dashboard['id'], 8), 404);
        $this->runAction('datasets.update', ['expected_version' => 1, 'name' => 'Shared', 'visibility' => 'organization', 'status' => 'active'], $dataset->id);
        $this->assertCount(1, $this->runAction('dashboards.render', [], $dashboard['id'], 8)['reports']);
        $this->assertSame($dataset->id, $this->runAction('datasets.detail', [], $dataset->id, 8)['resource']['id']);
        $this->runAction('datasets.update', ['expected_version' => 2, 'name' => 'Disabled', 'visibility' => 'organization', 'status' => 'disabled'], $dataset->id);
        $this->denied(fn () => $this->runAction('datasets.detail', [], $dataset->id, 8), 403);
        $this->denied(fn () => $this->runAction('reports.run', [], $report['id'], 8), 403);
        $this->assertSame(0, $this->runAction('datasets.list', [], null, 7, 12)['meta']['total']);
        $this->assertStringNotContainsString('Alpha', DB::table('insight_datasets')->value('rows'));
    }

    public function test_query_dsl_rejects_sql_invalid_types_stale_writes_and_foreign_columns(): void
    {
        $dataset = $this->dataset();
        $this->denied(fn () => $this->runAction('datasets.list', [], 1), 422);
        $this->denied(fn () => $this->runAction('datasets.replace', ['expected_version' => 99, 'rows' => []], $dataset->id), 409);
        foreach ([['team' => 'x', 'value' => 1.2, 'ready' => true], ['team' => 'x', 'value' => 1, 'ready' => 'true'],
            ['team' => 'x', 'value' => 1, 'ready' => true, 'unknown' => 'x']] as $row) {
            $this->denied(fn () => $this->runAction('datasets.replace', ['expected_version' => 0, 'rows' => [$row]], $dataset->id), 422);
        }
        foreach ([['metric' => ['aggregate' => 'sum', 'column' => 'team']], ['metric' => ['aggregate' => 'count', 'column' => 'value']],
            ['metric' => ['aggregate' => 'count'], 'group_by' => 'secret'], ['metric' => ['aggregate' => 'count'], 'filters' => [['column' => 'team', 'operator' => 'gte', 'value' => 'x']]]] as $definition) {
            $this->denied(fn () => $this->runAction('datasets.query', ['definition' => $definition], $dataset->id), 422);
        }
        $this->runAction('datasets.update', ['expected_version' => 0, 'name' => 'Shared', 'visibility' => 'organization', 'status' => 'active'], $dataset->id);
        $this->denied(fn () => $this->runAction('datasets.replace', ['expected_version' => 1, 'rows' => []], $dataset->id, 8), 403);
        $this->expectException(ValidationException::class);
        $this->runAction('datasets.query', ['definition' => ['metric' => ['aggregate' => 'count'], 'sql' => 'SELECT * FROM users']], $dataset->id);
    }

    public function test_strict_scope_boolean_authority_and_transaction_boundary(): void
    {
        $message = $this->message('datasets.list');
        $this->assertNull(AuthorizedInsightsScope::fromVerifiedExchange($message, fn (): bool => false));
        try {
            AuthorizedInsightsScope::fromVerifiedExchange($message, fn (): int => 1);
            $this->fail();
        } catch (\LogicException) {
            $this->assertTrue(true);
        }
        try {
            AuthorizedInsightsScope::fromVerifiedExchange([...$message, 'source' => 'crm'], fn (): bool => true);
            $this->fail();
        } catch (ValidationException) {
            $this->assertTrue(true);
        }
        $scope = AuthorizedInsightsScope::fromVerifiedExchange($message, fn (): bool => true);
        $this->expectException(\LogicException::class);
        app(InsightsActions::class)->execute($scope, []);
    }

    public function test_handler_returns_durable_safe_results_and_retries_unavailable_dependencies(): void
    {
        $transport = new ServiceTransport('https://platform.test', str_repeat('k', 32), 'insights', 'platform');
        Http::fake(function ($request) {
            $body = json_encode(['nonce' => $request['nonce'], 'allowed' => true]);

            return Http::response($body, 200, ['Content-Type' => 'application/json', 'X-Service-Receipt' => ServiceAuthentication::receipt(str_repeat('k', 32), $request->header('X-Service-Nonce')[0], $body)]);
        });
        $exchange = new ServiceExchange;
        $handler = new InsightsCommandHandler($exchange, $transport, app(InsightsActions::class));
        $dataset = $this->dataset();
        foreach ([['datasets.list', [], null, 200], ['datasets.detail', [], 999, 404], ['datasets.query', ['definition' => []], $dataset->id, 422],
            ['datasets.update', ['expected_version' => 99, 'name' => 'x', 'visibility' => 'private', 'status' => 'active'], $dataset->id, 409]] as [$action, $input, $id, $status]) {
            $message = $this->message($action, $input, $id);
            $exchange->accept($message, 'platform', 'insights');
            $this->assertTrue($handler->consumeOne());
            $exchange->accept($message, 'platform', 'insights');
            $this->assertFalse($handler->consumeOne());
            $this->assertSame($status, json_decode(ServiceDelivery::orderByDesc('id')->firstOrFail()->envelope, true)['payload']['http_status']);
        }
        Dataset::creating(fn () => abort(503));
        $exchange->accept($this->message('datasets.create', ['name' => 'x', 'visibility' => 'private', 'schema' => [['name' => 'n', 'type' => 'integer']]]), 'platform', 'insights');
        $this->assertTrue($handler->consumeOne());
        Dataset::flushEventListeners();
    }

    public function test_native_models_expose_enum_options_and_factories(): void
    {
        $this->assertSame(['string', 'integer', 'boolean'], array_keys(Dataset::options('type')));
        $this->assertSame(['count', 'sum', 'avg'], array_keys(Dataset::options('aggregate')));
        $this->assertSame(['manual'], array_keys(Dataset::options('source_kind')));
        foreach ([Dataset::class, Report::class, Dashboard::class] as $class) {
            $this->assertNotEmpty($class::factory()->make()->toArray());
            $this->assertSame(['active', 'disabled'], array_keys($class::options()));
            $this->assertSame(['private', 'organization'], array_keys($class::options('visibility')));
        }
    }

    public function test_result_guards_validate_shape_and_recheck_current_resource_dependencies(): void
    {
        $dataset = $this->dataset();
        $this->rows($dataset);
        $report = $this->runAction('reports.create', ['name' => 'Current report', 'visibility' => 'organization',
            'dataset_id' => $dataset->id, 'definition' => ['metric' => ['aggregate' => 'count']]])['resource'];
        $dashboard = $this->runAction('dashboards.create', ['name' => 'Current dashboard', 'visibility' => 'organization',
            'report_ids' => [$report['id']]])['resource'];
        $check = function (string $action, array $result, array $command = [], int $user = 7): bool {
            $scope = AuthorizedInsightsScope::fromVerifiedExchange($this->message($action, user: $user), fn (): bool => true);

            return DB::transaction(fn (): bool => app(InsightsActions::class)->authorizeResult($scope, $command, $result));
        };
        foreach (['datasets' => $dataset->id, 'reports' => $report['id'], 'dashboards' => $dashboard['id']] as $kind => $id) {
            $this->assertTrue($check($kind.'.list', ['data' => [['id' => $id]]]));
            $this->assertTrue($check($kind.'.list', ['data' => []]));
            foreach ([[], ['data' => 'invalid'], ['data' => ['id' => $id]],
                ['data' => array_fill(0, 51, ['id' => $id])], ['data' => [null]], ['data' => [['id' => (string) $id]]]] as $malformed) {
                $this->assertFalse($check($kind.'.list', $malformed));
            }
            $this->assertTrue($check($kind.'.detail', ['resource' => ['id' => $id]], ['id' => $id]));
            foreach ([[], ['resource' => ['id' => 0]], ['resource' => ['id' => (string) $id]]] as $malformed) {
                $this->assertFalse($check($kind.'.detail', $malformed));
            }
            $this->assertFalse($check($kind.'.detail', ['resource' => ['id' => $id]], ['id' => $id + 100]));
        }
        $freshness = ['dataset_id' => $dataset->id];
        $this->assertTrue($check('datasets.query', ['freshness' => $freshness]));
        $this->assertTrue($check('reports.run', ['report_id' => $report['id'], 'freshness' => $freshness]));
        $this->assertFalse($check('reports.run', ['report_id' => $report['id'], 'freshness' => ['dataset_id' => 999]]));
        $render = ['dashboard_id' => $dashboard['id'], 'reports' => [['report_id' => $report['id'], 'freshness' => $freshness]]];
        $this->assertTrue($check('dashboards.render', $render));
        foreach ([null, 'invalid', ['report_id' => $report['id']], array_fill(0, 7, []),
            [[]], [['report_id' => (string) $report['id']]], [['report_id' => 999]],
            [['report_id' => $report['id'], 'freshness' => ['dataset_id' => 999]]]] as $reports) {
            $this->assertFalse($check('dashboards.render', ['dashboard_id' => $dashboard['id'], 'reports' => $reports]));
        }
        $this->denied(fn () => $check('reports.run', ['report_id' => $report['id'], 'freshness' => $freshness], user: 8), 404);
        $dataset->update(['status' => Dataset::Disabled]);
        $this->denied(fn () => $check('reports.run', ['report_id' => $report['id'], 'freshness' => $freshness]), 403);
        $this->denied(fn () => $check('dashboards.render', $render), 403);
        $dataset->update(['status' => Dataset::Active]);
        Report::findOrFail($report['id'])->update(['visibility' => Dataset::Private]);
        $this->denied(fn () => $check('dashboards.render', $render, user: 8), 404);
        Report::findOrFail($report['id'])->delete();
        $this->expectException(ModelNotFoundException::class);
        $check('dashboards.render', $render);
    }

    public function test_result_guards_require_a_local_read_transaction(): void
    {
        $scope = AuthorizedInsightsScope::fromVerifiedExchange($this->message('datasets.list'), fn (): bool => true);
        $this->expectException(\LogicException::class);
        app(InsightsActions::class)->authorizeResult($scope, [], ['data' => []]);
    }
}
