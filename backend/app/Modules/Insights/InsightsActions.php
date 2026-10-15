<?php

namespace App\Modules\Insights;

use App\Modules\Insights\Models\InsightDashboard as Dashboard;
use App\Modules\Insights\Models\InsightDataset as Dataset;
use App\Modules\Insights\Models\InsightReport as Report;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use LogicException;

final class InsightsActions
{
    public function authorizeResult(AuthorizedInsightsScope $scope, array $command, array $result): bool
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Result guards require a local read transaction.');
        }
        [, $kind, $verb] = explode('.', $scope->action);
        $class = match ($kind) {
            'datasets' => Dataset::class, 'reports' => Report::class, 'dashboards' => Dashboard::class
        };
        if ($verb === 'list') {
            if (! isset($result['data']) || ! is_array($result['data']) || ! array_is_list($result['data']) || count($result['data']) > 50) {
                return false;
            }
            foreach ($result['data'] as $row) {
                if (! is_array($row) || ! is_int($row['id'] ?? null)) {
                    return false;
                }
                $this->record($scope, $class, $row['id']);
            }

            return true;
        }
        $id = $result['resource']['id'] ?? $result['report_id'] ?? $result['dashboard_id'] ?? $result['freshness']['dataset_id'] ?? null;
        if (! is_int($id) || $id < 1 || (isset($command['id']) && $command['id'] !== $id)) {
            return false;
        }
        $record = $this->record($scope, $class, $id);
        if (isset($result['resource'])) {
            $this->detail($scope, $record, []);

            return true;
        }
        $this->active($record);
        if ($kind === 'reports') {
            $this->active($this->record($scope, Dataset::class, $record->dataset_id));

            return ($result['freshness']['dataset_id'] ?? null) === $record->dataset_id;
        }
        if ($kind === 'dashboards') {
            if (! isset($result['reports']) || ! is_array($result['reports']) || ! array_is_list($result['reports']) || count($result['reports']) > 6) {
                return false;
            }
            foreach ($result['reports'] as $reportResult) {
                $reportId = $reportResult['report_id'] ?? null;
                if (! is_int($reportId) || ! in_array($reportId, $record->report_ids, true)) {
                    return false;
                }
                $reports = $this->reports($scope, [$reportId]);
                if (($reportResult['freshness']['dataset_id'] ?? null) !== $reports[0]->dataset_id) {
                    return false;
                }
            }
        }

        return true;
    }

    public function execute(AuthorizedInsightsScope $scope, array $input, ?int $id = null): array
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Insights requires a fenced local transaction.');
        }
        [, $kind, $verb] = explode('.', $scope->action);
        $class = match ($kind) {
            'datasets' => Dataset::class, 'reports' => Report::class, 'dashboards' => Dashboard::class
        };
        abort_unless(in_array($verb, ['list', 'create'], true) ? $id === null : $id !== null && $id > 0, 422);
        if ($verb === 'list') {
            return $this->listing($scope, $class, $input);
        }
        if ($verb === 'create') {
            return $this->create($scope, $class, $input);
        }
        $record = $this->record($scope, $class, $id);

        return match ($verb) {
            'detail' => $this->detail($scope, $record, $input),
            'update' => $this->update($scope, $record, $input),
            'replace' => $this->replace($scope, $record, $input),
            'query' => $this->query($record, $this->validate($input, ['definition' => 'required|array'])['definition']),
            'run' => $this->runReport($scope, $record, $input),
            'render' => $this->render($scope, $record, $input),
        };
    }

    private function record(AuthorizedInsightsScope $scope, string $class, int $id): Model
    {
        $record = $class::where('organization_id', $scope->organizationId)->whereKey($id)->lockForUpdate()->firstOrFail();
        abort_unless($record->owner_platform_user_id === $scope->platformUserId || $record->visibility === Dataset::Organization, 404);

        return $record;
    }

    private function active(Model $record): void
    {
        abort_unless($record->status === Dataset::Active, 403, 'Insights resource is disabled.');
    }

    private function listing(AuthorizedInsightsScope $scope, string $class, array $input): array
    {
        $data = $this->validate($input, ['page' => 'sometimes|integer:strict|min:1|max:1000000', 'per_page' => 'sometimes|integer:strict|min:1|max:50']);
        $page = $class::where('organization_id', $scope->organizationId)->where(fn ($q) => $q->where('owner_platform_user_id', $scope->platformUserId)
            ->orWhere('visibility', Dataset::Organization))->orderBy('id')->paginate($data['per_page'] ?? 20,
                ['id', 'name', 'status', 'visibility', 'version'], 'page', $data['page'] ?? 1);

        return ['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(), 'total' => $page->total()]];
    }

    private function create(AuthorizedInsightsScope $scope, string $class, array $input): array
    {
        $rules = ['name' => 'required|string|max:200', 'visibility' => ['required', Rule::in(array_keys(Dataset::options('visibility')))]];
        $rules += match ($class) {
            Dataset::class => ['schema' => 'required|array|min:1|max:20', 'schema.*' => 'required|array:name,type',
                'schema.*.name' => ['required', Dataset::Text, 'regex:/^[a-z][a-z0-9_]{0,39}$/D'], 'schema.*.type' => ['required', Rule::in(array_keys(Dataset::options('type')))]],
            Report::class => ['dataset_id' => 'required|integer:strict|min:1', 'definition' => 'required|array'],
            Dashboard::class => ['report_ids' => 'required|array|min:1|max:6', 'report_ids.*' => 'required|integer:strict|min:1|distinct'],
        };
        $data = $this->validate($input, $rules);
        if ($class === Dataset::class) {
            abort_unless(array_is_list($data['schema']) && count(array_unique(array_column($data['schema'], 'name'))) === count($data['schema']), 422);
            $data += ['rows' => [], 'source_kind' => Dataset::Manual];
        } elseif ($class === Report::class) {
            $dataset = $this->record($scope, Dataset::class, $data['dataset_id']);
            $this->active($dataset);
            $this->definition($dataset, $data['definition']);
        } else {
            $this->reports($scope, $data['report_ids']);
        }
        $record = $class::create([...$data, 'organization_id' => $scope->organizationId, 'owner_platform_user_id' => $scope->platformUserId]);

        return ['resource' => $record->toArray()];
    }

    private function detail(AuthorizedInsightsScope $scope, Model $record, array $input): array
    {
        $this->validate($input, []);
        if ($record->owner_platform_user_id !== $scope->platformUserId) {
            $this->active($record);
        }
        if ($record instanceof Report) {
            $this->active($this->record($scope, Dataset::class, $record->dataset_id));
        }
        if ($record instanceof Dashboard) {
            $this->reports($scope, $record->report_ids);
        }

        return ['resource' => $record->toArray(), 'options' => $record::options()];
    }

    private function update(AuthorizedInsightsScope $scope, Model $record, array $input): array
    {
        $data = $this->validate($input, ['expected_version' => 'required|integer:strict|min:0', 'name' => 'required|string|max:200',
            'visibility' => ['required', Rule::in(array_keys(Dataset::options('visibility')))], 'status' => ['required', Rule::in(array_keys(Dataset::options('status')))],
            ...($record instanceof Report ? ['definition' => 'required|array'] : []),
            ...($record instanceof Dashboard ? ['report_ids' => 'required|array|min:1|max:6', 'report_ids.*' => 'required|integer:strict|min:1|distinct'] : [])]);
        $this->ownerVersion($scope, $record, $data['expected_version']);
        if ($record instanceof Report) {
            $dataset = $this->record($scope, Dataset::class, $record->dataset_id);
            $this->active($dataset);
            $this->definition($dataset, $data['definition']);
        }
        if ($record instanceof Dashboard) {
            $this->reports($scope, $data['report_ids']);
        }
        unset($data['expected_version']);
        $record->update([...$data, 'version' => $record->version + 1]);

        return ['resource' => $record->fresh()->toArray()];
    }

    private function ownerVersion(AuthorizedInsightsScope $scope, Model $record, int $expected): void
    {
        abort_unless($record->owner_platform_user_id === $scope->platformUserId, 403);
        abort_unless($record->version === $expected, 409, 'Resource changed. Refresh before retrying.');
    }

    private function replace(AuthorizedInsightsScope $scope, Dataset $dataset, array $input): array
    {
        $data = $this->validate($input, ['expected_version' => 'required|integer:strict|min:0', 'rows' => 'present|array|max:500', 'rows.*' => 'required|array']);
        $this->ownerVersion($scope, $dataset, $data['expected_version']);
        $this->active($dataset);
        abort_unless(array_is_list($data['rows']) && strlen(json_encode($data['rows'], JSON_THROW_ON_ERROR)) <= 48000, 422);
        $schema = array_column($dataset->schema, 'type', 'name');
        foreach ($data['rows'] as $row) {
            abort_unless(count($row) === count($schema) && array_diff(array_keys($schema), array_keys($row)) === [], 422);
            foreach ($schema as $name => $type) {
                $this->value($type, $row[$name]);
            }
        }
        $dataset->update(['rows' => $data['rows'], 'imported_at' => now(), 'version' => $dataset->version + 1]);

        return ['resource' => $dataset->fresh()->toArray(), 'row_count' => count($data['rows'])];
    }

    private function value(string $type, mixed $value): void
    {
        $valid = match ($type) {
            Dataset::Integer => is_int($value) && $value >= -1000000000 && $value <= 1000000000,
            Dataset::Boolean => is_bool($value), Dataset::Text => is_string($value) && mb_strlen($value) <= 80,
        };
        abort_unless($valid, 422, 'Value does not match dataset type or bound.');
    }

    private function definition(Dataset $dataset, array $input): array
    {
        $data = $this->validate($input, ['metric' => 'required|array:aggregate,column', 'metric.aggregate' => ['required', Rule::in(array_keys(Dataset::options('aggregate')))],
            'metric.column' => 'sometimes|string|max:40', 'group_by' => 'sometimes|string|max:40',
            'limit' => 'sometimes|integer:strict|min:1|max:50', 'filters' => 'sometimes|array|max:5',
            'filters.*' => 'required|array:column,operator,value', 'filters.*.column' => 'required|string|max:40',
            'filters.*.operator' => 'required|in:eq,gte,lte', 'filters.*.value' => 'present']);
        $schema = array_column($dataset->schema, 'type', 'name');
        if (isset($data['group_by'])) {
            abort_unless(isset($schema[$data['group_by']]), 422);
        }
        if ($data['metric']['aggregate'] !== Dataset::Count) {
            abort_unless(($schema[$data['metric']['column'] ?? ''] ?? null) === Dataset::Integer, 422);
        } else {
            abort_if(isset($data['metric']['column']), 422);
        }
        foreach ($data['filters'] ?? [] as $filter) {
            abort_unless(isset($schema[$filter['column']]), 422);
            $this->value($schema[$filter['column']], $filter['value']);
            abort_unless($filter['operator'] === 'eq' || $schema[$filter['column']] === Dataset::Integer, 422);
        }

        return $data;
    }

    private function query(Dataset $dataset, array $input): array
    {
        $this->active($dataset);
        $definition = $this->definition($dataset, $input);
        $groups = [];
        foreach ($dataset->rows as $row) {
            $include = true;
            foreach ($definition['filters'] ?? [] as $filter) {
                $actual = $row[$filter['column']];
                $expected = $filter['value'];
                $include = $include && match ($filter['operator']) {
                    'eq' => $actual === $expected, 'gte' => $actual >= $expected, 'lte' => $actual <= $expected
                };
            }
            if (! $include) {
                continue;
            }
            $group = isset($definition['group_by']) ? $row[$definition['group_by']] : null;
            $key = json_encode($group, JSON_THROW_ON_ERROR);
            $groups[$key] ??= ['group' => $group, 'count' => 0, 'sum' => 0];
            $groups[$key]['count']++;
            if ($definition['metric']['aggregate'] !== Dataset::Count) {
                $groups[$key]['sum'] += $row[$definition['metric']['column']];
            }
        }
        ksort($groups);
        $result = array_map(fn (array $group): array => ['group' => $group['group'], 'value' => match ($definition['metric']['aggregate']) {
            Dataset::Count => $group['count'], Dataset::Sum => $group['sum'], Dataset::Average => ['numerator' => $group['sum'], 'denominator' => $group['count']],
        }], array_slice(array_values($groups), 0, $definition['limit'] ?? 50));

        return ['data' => $result, 'freshness' => ['dataset_id' => $dataset->id, 'dataset_version' => $dataset->version,
            'imported_at' => $dataset->imported_at?->toIso8601String(), 'source_kind' => Dataset::Manual],
            'meta' => ['groups_total' => count($groups), 'truncated' => count($groups) > count($result), 'rows_scanned' => count($dataset->rows)]];
    }

    private function runReport(AuthorizedInsightsScope $scope, Report $report, array $input): array
    {
        $this->validate($input, []);
        $this->active($report);

        return ['report_id' => $report->id, 'report_version' => $report->version,
            ...$this->query($this->record($scope, Dataset::class, $report->dataset_id), $report->definition)];
    }

    private function reports(AuthorizedInsightsScope $scope, array $ids): array
    {
        abort_unless(array_is_list($ids), 422);
        $reports = [];
        foreach ($ids as $id) {
            $report = $this->record($scope, Report::class, $id);
            $this->active($report);
            $this->active($this->record($scope, Dataset::class, $report->dataset_id));
            $reports[] = $report;
        }

        return $reports;
    }

    private function render(AuthorizedInsightsScope $scope, Dashboard $dashboard, array $input): array
    {
        $this->validate($input, []);
        $this->active($dashboard);

        return ['dashboard_id' => $dashboard->id, 'dashboard_version' => $dashboard->version,
            'reports' => array_map(fn (Report $report): array => $this->runReport($scope, $report, []), $this->reports($scope, $dashboard->report_ids))];
    }

    private function validate(array $input, array $rules): array
    {
        foreach (['page', 'per_page'] as $field) {
            if (isset($rules[$field], $input[$field]) && is_string($input[$field]) && preg_match('/^[1-9][0-9]{0,6}$/D', $input[$field])) {
                $input[$field] = (int) $input[$field];
            }
        }
        $allowed = array_filter(array_keys($rules), fn (string $key): bool => ! str_contains($key, '.'));
        foreach (array_diff(array_keys($input), $allowed) as $field) {
            throw ValidationException::withMessages([$field => 'Unknown field.']);
        }

        return Validator::make($input, $rules)->validate();
    }
}
