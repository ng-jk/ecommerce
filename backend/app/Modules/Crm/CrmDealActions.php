<?php

namespace App\Modules\Crm;

use App\Modules\Crm\Models\Activity;
use App\Modules\Crm\Models\Company;
use App\Modules\Crm\Models\Contact;
use App\Modules\Crm\Models\Deal;
use App\Modules\Crm\Models\Pipeline;
use App\Modules\Crm\Models\Stage;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class CrmDealActions
{
    public function execute(AuthorizedCrmScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null && $id < 1, 404);
        abort_if($id !== null && str_ends_with($scope->action, '.list'), 422);
        abort_if($id !== null && str_ends_with($scope->action, '.create'), 422);

        return match ($scope->action) {
            'crm.pipelines.list' => $this->pipelines($scope, $input),
            'crm.pipelines.create' => $this->createPipeline($scope, $input),
            'crm.pipelines.detail' => $this->pipeline($scope, $this->id($id), $input),
            'crm.pipelines.update' => $this->updatePipeline($scope, $this->id($id), $input),
            'crm.stages.list' => $this->stages($scope, $input),
            'crm.stages.create' => $this->createStage($scope, $input),
            'crm.stages.detail' => $this->stage($scope, $this->id($id), $input),
            'crm.stages.update' => $this->updateStage($scope, $this->id($id), $input),
            'crm.deals.list' => $this->deals($scope, $input),
            'crm.deals.create' => $this->createDeal($scope, $input),
            'crm.deals.detail' => $this->deal($scope, $this->id($id), $input),
            'crm.deals.update' => $this->updateDeal($scope, $this->id($id), $input),
            'crm.deals.advance' => $this->advanceDeal($scope, $this->id($id), $input),
            'crm.activities.list' => $this->activities($scope, $input),
            'crm.activities.create' => $this->createActivity($scope, $input),
            'crm.activities.detail' => $this->activity($scope, $this->id($id), $input),
            default => abort(403, 'CRM action is unavailable.'),
        };
    }

    private function pipelines(AuthorizedCrmScope $scope, array $input): array
    {
        $data = $this->validated($input, $this->pageRules() + ['code' => 'sometimes|string|min:3|max:80'], ['code']);
        $query = Pipeline::query()->where('organization_id', $scope->organizationId);
        if (isset($data['code'])) {
            $query->whereRaw('lower(code) = ?', [$data['code']]);
        }
        $page = $query->orderBy('id')->paginate($data['per_page'] ?? 20, ['*'], 'page', $data['page'] ?? 1);

        return ['data' => $page->getCollection()->map(fn (Pipeline $row): array => $this->publicPipeline($row))->all(),
            'meta' => $this->meta($page)];
    }

    private function createPipeline(AuthorizedCrmScope $scope, array $input): array
    {
        $data = $this->validated($input, ['code' => $this->codeRules(), 'name' => 'required|string|min:1|max:200'], ['code']);
        try {
            $row = DB::transaction(fn (): Pipeline => Pipeline::create(['organization_id' => $scope->organizationId, 'code' => $data['code'],
                'name' => trim($data['name']), 'created_by_platform_user_id' => $scope->platformUserId,
                'updated_by_platform_user_id' => $scope->platformUserId]));
        } catch (QueryException $error) {
            $this->uniqueOrThrow($error, 'code');
        }

        return ['pipeline' => $this->publicPipeline($row)];
    }

    private function pipeline(AuthorizedCrmScope $scope, int $id, array $input): array
    {
        $this->validated($input, []);

        return ['pipeline' => $this->publicPipeline($this->pipelineRow($scope, $id))];
    }

    private function updatePipeline(AuthorizedCrmScope $scope, int $id, array $input): array
    {
        $data = $this->validated($input, ['name' => 'required|string|min:1|max:200',
            'expected_version' => 'required|integer:strict|min:0']);
        $row = $this->pipelineRow($scope, $id, true);
        $this->version($row->version, $data['expected_version']);
        $row->update(['name' => trim($data['name']), 'version' => $row->version + 1,
            'updated_by_platform_user_id' => $scope->platformUserId]);

        return ['pipeline' => $this->publicPipeline($row)];
    }

    private function stages(AuthorizedCrmScope $scope, array $input): array
    {
        $data = $this->validated($input, $this->pageRules() + [
            'pipeline_id' => 'required|integer:strict|min:1',
            'outcome' => ['sometimes', Rule::in(array_keys(Stage::options()))],
        ]);
        $query = Stage::query()->where('organization_id', $scope->organizationId)
            ->where('pipeline_id', $data['pipeline_id']);
        if (isset($data['outcome'])) {
            $query->where('outcome', $data['outcome']);
        }
        $page = $query->orderBy('position')->orderBy('id')->paginate(
            $data['per_page'] ?? 20, ['*'], 'page', $data['page'] ?? 1);

        return ['data' => $page->getCollection()->map(fn (Stage $row): array => $this->publicStage($row))->all(),
            'meta' => [...$this->meta($page), 'options' => ['outcome' => Stage::options()]]];
    }

    private function createStage(AuthorizedCrmScope $scope, array $input): array
    {
        $data = $this->validated($input, ['pipeline_id' => 'required|integer:strict|min:1',
            'code' => $this->codeRules(), 'name' => 'required|string|min:1|max:200',
            'position' => 'required|integer:strict|min:1|max:1000',
            'outcome' => ['required', Rule::in(array_keys(Stage::options()))]], ['code']);
        $this->pipelineRow($scope, $data['pipeline_id'], true);
        $rows = Stage::query()->where('organization_id', $scope->organizationId)
            ->where('pipeline_id', $data['pipeline_id'])->get(['code', 'position', 'outcome']);
        foreach ($rows as $existing) {
            if ($data['code'] === $existing->code) {
                throw ValidationException::withMessages(['code' => 'The value is already in use.']);
            }
            if ($data['position'] === $existing->position) {
                throw ValidationException::withMessages(['position' => 'The value is already in use.']);
            }
            abort_if($data['outcome'] === Stage::Open && $existing->outcome !== Stage::Open
                && $data['position'] >= $existing->position, 409, 'Open stages must precede terminal stages.');
            abort_if($data['outcome'] !== Stage::Open && $existing->outcome === Stage::Open
                && $data['position'] <= $existing->position, 409, 'Terminal stages must follow open stages.');
        }
        try {
            $row = DB::transaction(fn (): Stage => Stage::create(['organization_id' => $scope->organizationId,
                'pipeline_id' => $data['pipeline_id'], 'code' => $data['code'],
                'name' => trim($data['name']), 'position' => $data['position'], 'outcome' => $data['outcome'],
                'created_by_platform_user_id' => $scope->platformUserId,
                'updated_by_platform_user_id' => $scope->platformUserId]));
        } catch (QueryException $error) {
            $this->uniqueOrThrow($error, 'code');
        }

        return $this->stageResult($row);
    }

    private function stage(AuthorizedCrmScope $scope, int $id, array $input): array
    {
        $this->validated($input, []);

        return $this->stageResult($this->stageRow($scope, $id));
    }

    private function updateStage(AuthorizedCrmScope $scope, int $id, array $input): array
    {
        $data = $this->validated($input, ['name' => 'required|string|min:1|max:200',
            'expected_version' => 'required|integer:strict|min:0']);
        $row = $this->stageRow($scope, $id, true);
        $this->version($row->version, $data['expected_version']);
        $row->update(['name' => trim($data['name']), 'version' => $row->version + 1,
            'updated_by_platform_user_id' => $scope->platformUserId]);

        return $this->stageResult($row);
    }

    private function deals(AuthorizedCrmScope $scope, array $input): array
    {
        $data = $this->validated($input, $this->pageRules() + [
            'pipeline_id' => 'sometimes|integer:strict|min:1',
            'stage_id' => 'sometimes|integer:strict|min:1',
            'status' => ['sometimes', Rule::in(array_keys(Deal::options()))],
            'assignee_platform_user_id' => 'sometimes|integer:strict|min:1',
            'company_id' => 'sometimes|integer:strict|min:1',
        ]);
        if (isset($data['stage_id']) && ! isset($data['pipeline_id'])) {
            throw ValidationException::withMessages(['stage_id' => 'Stage filter requires pipeline.']);
        }
        $query = Deal::query()->where('organization_id', $scope->organizationId);
        foreach (['pipeline_id', 'stage_id', 'status', 'assignee_platform_user_id', 'company_id'] as $filter) {
            if (isset($data[$filter])) {
                $query->where($filter, $data[$filter]);
            }
        }
        $page = $query->orderBy('id')->paginate($data['per_page'] ?? 20, ['*'], 'page', $data['page'] ?? 1);

        return ['data' => $page->getCollection()->map(fn (Deal $row): array => $this->publicDeal($row))->all(),
            'meta' => [...$this->meta($page), 'options' => ['status' => Deal::options()]]];
    }

    private function createDeal(AuthorizedCrmScope $scope, array $input): array
    {
        $data = $this->validated($input, $this->dealRules(false));
        $this->assignment($scope, $data['assignee_platform_user_id']);
        $this->pipelineRow($scope, $data['pipeline_id']);
        $stage = $this->stageRow($scope, $data['stage_id']);
        abort_unless($stage->pipeline_id === $data['pipeline_id'] && $stage->outcome === Stage::Open,
            409, 'A deal must start in an open stage of its pipeline.');
        $this->references($scope, $data['company_id'], $data['contact_id']);
        $row = Deal::create(['organization_id' => $scope->organizationId, ...$data,
            'status' => Deal::Open, 'created_by_platform_user_id' => $scope->platformUserId,
            'updated_by_platform_user_id' => $scope->platformUserId]);

        return $this->dealResult($row);
    }

    private function deal(AuthorizedCrmScope $scope, int $id, array $input): array
    {
        $this->validated($input, []);

        return $this->dealResult($this->dealRow($scope, $id));
    }

    private function updateDeal(AuthorizedCrmScope $scope, int $id, array $input): array
    {
        $data = $this->validated($input, $this->dealRules(true));
        $row = $this->dealRow($scope, $id, true);
        $this->version($row->version, $data['expected_version']);
        abort_unless($row->status === Deal::Open, 409, 'A closed deal cannot be edited.');
        $this->assignment($scope, $data['assignee_platform_user_id']);
        $this->references($scope, $data['company_id'], $data['contact_id']);
        unset($data['expected_version']);
        $row->update([...$data, 'version' => $row->version + 1,
            'updated_by_platform_user_id' => $scope->platformUserId]);

        return $this->dealResult($row);
    }

    private function advanceDeal(AuthorizedCrmScope $scope, int $id, array $input): array
    {
        $data = $this->validated($input, ['stage_id' => 'required|integer:strict|min:1',
            'expected_version' => 'required|integer:strict|min:0']);
        $row = $this->dealRow($scope, $id, true);
        $this->version($row->version, $data['expected_version']);
        abort_unless($row->status === Deal::Open, 409, 'A closed deal cannot advance.');
        $before = $this->stageRow($scope, $row->stage_id);
        $after = $this->stageRow($scope, $data['stage_id']);
        abort_unless($after->pipeline_id === $row->pipeline_id && $after->position > $before->position,
            409, 'Deal stage must advance within the pipeline.');
        $row->update(['stage_id' => $after->id, 'status' => $after->outcome,
            'version' => $row->version + 1, 'updated_by_platform_user_id' => $scope->platformUserId]);

        return $this->dealResult($row);
    }

    private function activities(AuthorizedCrmScope $scope, array $input): array
    {
        $data = $this->validated($input, $this->pageRules() + [
            'deal_id' => 'sometimes|integer:strict|min:1',
            'type' => ['sometimes', Rule::in(array_keys(Activity::options()))],
        ]);
        $query = Activity::query()->where('organization_id', $scope->organizationId);
        foreach (['deal_id', 'type'] as $filter) {
            if (isset($data[$filter])) {
                $query->where($filter, $data[$filter]);
            }
        }
        $page = $query->orderBy('id')->paginate($data['per_page'] ?? 20, ['*'], 'page', $data['page'] ?? 1);

        return ['data' => $page->getCollection()->map(fn (Activity $row): array => $this->publicActivity($row))->all(),
            'meta' => [...$this->meta($page), 'options' => ['type' => Activity::options()]]];
    }

    private function createActivity(AuthorizedCrmScope $scope, array $input): array
    {
        $data = $this->validated($input, ['deal_id' => 'required|integer:strict|min:1',
            'type' => ['required', Rule::in(array_keys(Activity::options()))],
            'summary' => 'required|string|min:1|max:500',
            'occurred_at' => 'required|date_format:Y-m-d\\TH:i:sP']);
        $this->dealRow($scope, $data['deal_id']);
        $row = Activity::create(['organization_id' => $scope->organizationId,
            'deal_id' => $data['deal_id'], 'type' => $data['type'],
            'summary' => trim($data['summary']), 'occurred_at' => $data['occurred_at'],
            'created_by_platform_user_id' => $scope->platformUserId]);

        return $this->activityResult($row);
    }

    private function activity(AuthorizedCrmScope $scope, int $id, array $input): array
    {
        $this->validated($input, []);

        return $this->activityResult(Activity::query()->where('organization_id', $scope->organizationId)->findOrFail($id));
    }

    private function dealRules(bool $update): array
    {
        return ['title' => 'required|string|min:1|max:200',
            ...($update ? [] : ['pipeline_id' => 'required|integer:strict|min:1', 'stage_id' => 'required|integer:strict|min:1']),
            'company_id' => 'present|nullable|integer:strict|min:1',
            'contact_id' => 'present|nullable|integer:strict|min:1',
            'assignee_platform_user_id' => 'present|nullable|integer:strict|min:1',
            'amount_minor' => 'required|integer:strict|min:0|max:9000000000000000',
            'currency' => ['required', 'string', 'regex:/^[A-Z]{3}$/D'],
            ...($update ? ['expected_version' => 'required|integer:strict|min:0'] : [])];
    }

    private function pageRules(): array
    {
        return ['page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50'];
    }

    private function codeRules(): array
    {
        return ['required', 'string', 'min:3', 'max:80', 'regex:/^[a-z][a-z0-9-]*$/D'];
    }

    private function validated(array $input, array $rules, array $normalize = []): array
    {
        foreach (array_diff(array_keys($input), array_keys($rules)) as $field) {
            throw ValidationException::withMessages([$field => 'The field is not supported.']);
        }
        foreach ($normalize as $field) {
            if (is_string($input[$field] ?? null)) {
                $input[$field] = strtolower(trim($input[$field]));
            }
        }
        foreach (['page', 'per_page', 'pipeline_id', 'stage_id', 'company_id',
            'contact_id', 'deal_id', 'assignee_platform_user_id'] as $field) {
            if (isset($input[$field]) && is_string($input[$field])
                && preg_match('/^[1-9][0-9]*$/D', $input[$field])) {
                $input[$field] = (int) $input[$field];
            }
        }

        return Validator::make($input, $rules)->validate();
    }

    private function assignment(AuthorizedCrmScope $scope, ?int $target): void
    {
        abort_unless($scope->subjectPlatformUserId === $target, 403, 'Deal assignment is not authorized.');
    }

    private function references(AuthorizedCrmScope $scope, ?int $companyId, ?int $contactId): void
    {
        if ($companyId !== null) {
            Company::query()->where('organization_id', $scope->organizationId)->findOrFail($companyId);
        }
        if ($contactId !== null) {
            $contact = Contact::query()->where('organization_id', $scope->organizationId)->findOrFail($contactId);
            abort_unless($companyId === null || $contact->company_id === $companyId, 409,
                'Contact belongs to another company.');
        }
    }

    private function pipelineRow(AuthorizedCrmScope $scope, int $id, bool $lock = false): Pipeline
    {
        $query = Pipeline::query()->where('organization_id', $scope->organizationId);

        return ($lock ? $query->lockForUpdate() : $query)->findOrFail($id);
    }

    private function stageRow(AuthorizedCrmScope $scope, int $id, bool $lock = false): Stage
    {
        $query = Stage::query()->where('organization_id', $scope->organizationId);

        return ($lock ? $query->lockForUpdate() : $query)->findOrFail($id);
    }

    private function dealRow(AuthorizedCrmScope $scope, int $id, bool $lock = false): Deal
    {
        $query = Deal::query()->where('organization_id', $scope->organizationId);

        return ($lock ? $query->lockForUpdate() : $query)->findOrFail($id);
    }

    private function version(int $current, int $expected): void
    {
        abort_unless($current === $expected, 409, 'The CRM record changed. Refresh before retrying.');
    }

    private function id(?int $id): int
    {
        abort_unless($id !== null, 404);

        return $id;
    }

    private function uniqueOrThrow(QueryException $error, string $field): never
    {
        if (in_array($error->getCode(), ['23505', '23000', '19'], true)) {
            throw ValidationException::withMessages([$field => 'The value is already in use.']);
        }

        throw $error;
    }

    private function publicPipeline(Pipeline $row): array
    {
        return ['id' => $row->id, 'code' => $row->code, 'name' => $row->name, 'version' => $row->version];
    }

    private function publicStage(Stage $row): array
    {
        return ['id' => $row->id, 'pipeline_id' => $row->pipeline_id, 'code' => $row->code,
            'name' => $row->name, 'position' => $row->position, 'outcome' => $row->outcome,
            'version' => $row->version];
    }

    private function publicDeal(Deal $row): array
    {
        return ['id' => $row->id, 'pipeline_id' => $row->pipeline_id, 'stage_id' => $row->stage_id,
            'company_id' => $row->company_id, 'contact_id' => $row->contact_id,
            'assignee_platform_user_id' => $row->assignee_platform_user_id,
            'title' => $row->title, 'amount_minor' => $row->amount_minor, 'currency' => $row->currency,
            'status' => $row->status, 'version' => $row->version];
    }

    private function publicActivity(Activity $row): array
    {
        return ['id' => $row->id, 'deal_id' => $row->deal_id, 'type' => $row->type,
            'summary' => $row->summary, 'occurred_at' => $row->occurred_at->toIso8601String()];
    }

    private function stageResult(Stage $row): array
    {
        return ['stage' => $this->publicStage($row), 'options' => ['outcome' => Stage::options()]];
    }

    private function dealResult(Deal $row): array
    {
        return ['deal' => $this->publicDeal($row), 'options' => ['status' => Deal::options()]];
    }

    private function activityResult(Activity $row): array
    {
        return ['activity' => $this->publicActivity($row), 'options' => ['type' => Activity::options()]];
    }

    private function meta(LengthAwarePaginator $page): array
    {
        return ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
            'total' => $page->total(), 'per_page' => $page->perPage()];
    }
}
