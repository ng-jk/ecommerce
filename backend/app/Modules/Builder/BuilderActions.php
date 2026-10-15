<?php

namespace App\Modules\Builder;

use App\Modules\Builder\Models\Page;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class BuilderActions
{
    public function authorizeResult(AuthorizedBuilderScope $scope, array $command, array $result): bool
    {
        if ($scope->action === 'builder.pages.render') {
            return Page::where('organization_id', $scope->organizationId)->whereKey($command['id'] ?? null)
                ->whereNotNull('published_version')->exists();
        }

        return in_array($scope->action, AuthorizedBuilderScope::Actions, true);
    }

    public function execute(AuthorizedBuilderScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null && $id < 1, 404);

        return match ($scope->action) {
            'builder.pages.list' => $this->list($scope, $input, $id),
            'builder.pages.create' => $this->create($scope, $input, $id),
            'builder.pages.detail' => $this->detail($scope, $input, $this->id($id)),
            'builder.pages.update' => $this->update($scope, $input, $this->id($id)),
            'builder.pages.publish' => $this->publish($scope, $input, $this->id($id)),
            'builder.pages.render' => $this->render($scope, $input, $this->id($id)),
            default => abort(403, 'Builder action is unavailable.'),
        };
    }

    private function list(AuthorizedBuilderScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null, 422);
        $data = $this->validated($input, ['page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50',
            'status' => ['sometimes', Rule::in(array_keys(Page::options()))]], true);
        $query = Page::query()->where('organization_id', $scope->organizationId);
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20), ['*'], 'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (Page $row): array => $this->publicPage($row))->all(),
            'meta' => [...$this->meta($page), 'options' => ['status' => Page::options(),
                'block_type' => BuilderBlockSchema::options()]]];
    }

    private function create(AuthorizedBuilderScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null, 422);
        $data = $this->validated($input, ['slug' => ['required', 'string', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', 'min:2', 'max:100'],
            'title' => 'required|string|min:1|max:200', 'blocks' => 'present|array']);
        $blocks = BuilderBlockSchema::validate($data['blocks']);
        try {
            $row = DB::transaction(fn (): Page => Page::create(['organization_id' => $scope->organizationId,
                'created_by_platform_user_id' => $scope->platformUserId,
                'updated_by_platform_user_id' => $scope->platformUserId, 'slug' => $data['slug'],
                'title' => trim($data['title']), 'draft_blocks' => $blocks]));
        } catch (QueryException $error) {
            $this->uniqueOrThrow($error);
        }

        return ['page' => $this->publicPage($row), 'options' => $this->options()];
    }

    private function detail(AuthorizedBuilderScope $scope, array $input, int $id): array
    {
        $this->validated($input, []);

        return ['page' => $this->publicPage($this->row($scope, $id)), 'options' => $this->options()];
    }

    private function update(AuthorizedBuilderScope $scope, array $input, int $id): array
    {
        $data = $this->validated($input, ['title' => 'required|string|min:1|max:200',
            'blocks' => 'present|array', 'expected_version' => 'required|integer:strict|min:0']);
        $blocks = BuilderBlockSchema::validate($data['blocks']);
        $row = $this->row($scope, $id, true);
        $this->version($row, $data['expected_version']);
        $row->update(['title' => trim($data['title']), 'draft_blocks' => $blocks,
            'status' => Page::Draft, 'version' => $row->version + 1,
            'updated_by_platform_user_id' => $scope->platformUserId]);

        return ['page' => $this->publicPage($row), 'options' => $this->options()];
    }

    private function publish(AuthorizedBuilderScope $scope, array $input, int $id): array
    {
        $data = $this->validated($input, ['expected_version' => 'required|integer:strict|min:0']);
        $row = $this->row($scope, $id, true);
        $this->version($row, $data['expected_version']);
        abort_if($row->status === Page::Published, 409, 'Page is already published at this version.');
        $row->update(['published_title' => $row->title, 'published_blocks' => $row->draft_blocks,
            'published_version' => $row->version + 1, 'published_at' => now(),
            'status' => Page::Published, 'version' => $row->version + 1,
            'updated_by_platform_user_id' => $scope->platformUserId]);

        return ['page' => $this->publicPage($row), 'options' => $this->options()];
    }

    private function render(AuthorizedBuilderScope $scope, array $input, int $id): array
    {
        $this->validated($input, []);
        $row = $this->row($scope, $id);
        abort_if($row->published_version === null, 404);

        return ['render' => ['slug' => $row->slug, 'title' => $row->published_title,
            'blocks' => $row->published_blocks, 'published_version' => $row->published_version]];
    }

    private function row(AuthorizedBuilderScope $scope, int $id, bool $lock = false): Page
    {
        $query = Page::query()->where('organization_id', $scope->organizationId)->whereKey($id);

        return ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
    }

    private function id(?int $id): int
    {
        abort_if($id === null, 404);

        return $id;
    }

    private function version(Page $row, int $expected): void
    {
        abort_if($row->version !== $expected, 409, 'Page version changed.');
    }

    private function validated(array $input, array $rules, bool $query = false): array
    {
        $unknown = array_diff(array_keys($input), array_keys($rules));
        if ($unknown !== []) {
            throw ValidationException::withMessages([array_values($unknown)[0] => 'Field is not accepted.']);
        }
        if ($query) {
            foreach (['page', 'per_page'] as $field) {
                if (isset($input[$field]) && is_string($input[$field]) && preg_match('/^[1-9][0-9]*$/D', $input[$field])) {
                    $parsed = filter_var($input[$field], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                    if ($parsed !== false) {
                        $input[$field] = $parsed;
                    }
                }
            }
        }

        return Validator::make($input, $rules)->validate();
    }

    private function publicPage(Page $row): array
    {
        return ['id' => $row->id, 'slug' => $row->slug, 'title' => $row->title,
            'blocks' => $row->draft_blocks, 'status' => $row->status,
            'version' => $row->version, 'published_version' => $row->published_version,
            'published_at' => $row->published_at?->toISOString()];
    }

    private function options(): array
    {
        return ['status' => Page::options(), 'block_type' => BuilderBlockSchema::options()];
    }

    private function meta(LengthAwarePaginator $page): array
    {
        return ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(),
            'last_page' => $page->lastPage(), 'total' => $page->total()];
    }

    private function uniqueOrThrow(QueryException $error): never
    {
        if (in_array((string) $error->getCode(), ['23000', '23505'], true)) {
            throw ValidationException::withMessages(['slug' => 'Slug is already in use.']);
        }

        throw $error;
    }
}
