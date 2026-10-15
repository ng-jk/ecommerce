<?php

namespace App\Modules\Lending;

use App\Modules\Lending\Models\LendingApplication as Application;
use App\Modules\Lending\Models\LendingProduct as Product;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use LogicException;

final class LendingActions
{
    public function authorizeResult(AuthorizedLendingScope $scope, array $command, array $result): bool
    {
        if (! in_array($scope->action, AuthorizedLendingScope::Actions, true)) {
            return false;
        }
        if (! str_starts_with($scope->action, 'lending.applications.')) {
            return true;
        }
        $ids = isset($result['data']) ? array_column($result['data'], 'id')
            : [$result['application']['id'] ?? $result['application_id'] ?? null];
        $ids = array_values(array_unique($ids));

        return Application::where('organization_id', $scope->organizationId)
            ->where('applicant_platform_user_id', $scope->platformUserId)->whereIn('id', $ids)->count() === count($ids);
    }

    public function execute(AuthorizedLendingScope $scope, array $input, ?int $id = null): array
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Lending effects require the inbox transaction.');
        }
        [, $kind, $action] = explode('.', $scope->action);
        if ($action === 'list') {
            return $this->listing($scope, $kind, $input);
        }
        if ($kind === 'products') {
            return $this->productAction($scope, $action, $input, $id);
        }
        if ($action === 'create') {
            $data = $this->validate($input, ['product_id' => 'required|integer:strict|min:1', ...$this->applicationRules()]);
            $product = $this->product($scope, $data['product_id']);
            $this->eligibleTerms($product, $data);
            $application = Application::create([...$data, 'organization_id' => $scope->organizationId, 'applicant_platform_user_id' => $scope->platformUserId]);

            return $this->applicationResult($application);
        }
        // All term-changing commands lock product before application, consistently.
        $query = Application::where('organization_id', $scope->organizationId);
        if ($kind !== 'reviews') {
            $query->where('applicant_platform_user_id', $scope->platformUserId);
        }
        $candidate = (clone $query)->findOrFail($id);
        $product = in_array($action, ['update', 'submit', 'decide'], true) ? $this->product($scope, $candidate->product_id) : null;
        $application = $query->lockForUpdate()->findOrFail($candidate->id);
        if ($action === 'detail') {
            $this->validate($input, []);

            return $this->applicationResult($application);
        }
        if ($action === 'schedule') {
            $this->validate($input, []);
            abort_unless($application->status === Application::Approved, 409, 'A schedule requires approved frozen terms.');

            return ['application_id' => $application->id, 'application_version' => $application->version,
                'currency' => $application->terms_snapshot['currency'], 'minor_unit_digits' => $application->terms_snapshot['minor_unit_digits'],
                ...app(LendingSchedule::class)->build($application->terms_snapshot)];
        }
        $rules = ['expected_version' => 'required|integer:strict|min:0'];
        if ($action === 'update') {
            $rules = [...$rules, ...$this->applicationRules()];
        }
        if ($action === 'decide') {
            $rules += ['decision' => ['required', Rule::in([Application::Approved, Application::Rejected])], 'decision_note' => 'required|string|min:1|max:4000'];
        }
        $data = $this->validate($input, $rules);
        $this->version($application, $data['expected_version']);
        if ($action === 'update') {
            abort_unless($application->status === Application::Draft, 409, 'Submitted terms are immutable.');
            unset($data['expected_version']);
            $this->eligibleTerms($product, $data);
            $application->fill($data);
        } elseif ($action === 'submit') {
            abort_unless($application->status === Application::Draft, 409, 'Only drafts can be submitted.');
            $this->eligibleTerms($product, $application->toArray());
            $application->terms_snapshot = [...$product->only(['currency', 'minor_unit_digits', 'jurisdiction_label', 'terms_text', 'term_rate_numerator', 'term_rate_denominator', 'installment_count', 'interval_days']),
                'product_id' => $product->id, 'product_version' => $product->version, 'principal_minor' => $application->principal_minor, 'first_due_date' => $application->first_due_date];
            $application->status = Application::Submitted;
            $application->submitted_at = now();
        } elseif ($action === 'withdraw') {
            abort_unless(in_array($application->status, [Application::Draft, Application::Submitted], true), 409, 'Terminal applications cannot be withdrawn.');
            $application->status = Application::Withdrawn;
            $application->withdrawn_at = now();
        } else {
            abort_unless($application->status === Application::Submitted, 409, 'Only submitted applications may be decided.');
            abort_if($application->applicant_platform_user_id === $scope->platformUserId, 403, 'Applicant and decision maker must differ.');
            if ($data['decision'] === Application::Approved) {
                abort_unless($product->status === Product::Active, 403, 'The product is unavailable for approval.');
                $this->futureDate($application->terms_snapshot['first_due_date']);
                app(LendingSchedule::class)->build($application->terms_snapshot);
            }
            $application->status = $data['decision'];
            $application->decision_note = $data['decision_note'];
            $application->decided_by_platform_user_id = $scope->platformUserId;
            $application->decided_at = now();
        }
        $application->version++;
        $application->save();

        return $this->applicationResult($application);
    }

    private function listing(AuthorizedLendingScope $scope, string $kind, array $input): array
    {
        $class = $kind === 'products' ? Product::class : Application::class;
        $data = $this->validate($input, ['page' => 'sometimes|integer:strict|min:1|max:1000000', 'per_page' => 'sometimes|integer:strict|min:1|max:50', 'status' => ['sometimes', Rule::in(array_keys($class::options()))]]);
        $query = $class::where('organization_id', $scope->organizationId);
        if ($kind === 'applications') {
            $query->where('applicant_platform_user_id', $scope->platformUserId);
        }
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }
        $columns = $kind === 'products'
            ? ['id', 'code', 'name', 'jurisdiction_label', 'currency', 'minor_unit_digits', 'principal_min_minor', 'principal_max_minor', 'status', 'version']
            : ['id', 'applicant_platform_user_id', 'product_id', 'principal_minor', 'first_due_date', 'status', 'version'];
        $page = $query->orderBy('id')->paginate($data['per_page'] ?? 20, $columns, 'page', $data['page'] ?? 1);

        return ['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total(), 'options' => $class::options()]];
    }

    private function productAction(AuthorizedLendingScope $scope, string $action, array $input, ?int $id): array
    {
        $product = $action === 'create' ? new Product(['organization_id' => $scope->organizationId]) : $this->product($scope, $id);
        if ($action === 'detail') {
            $this->validate($input, []);
        } else {
            $rules = ['name' => 'required|string|min:1|max:200', 'jurisdiction_label' => 'required|string|min:1|max:120', 'terms_text' => 'required|string|min:1|max:4000',
                'currency' => ['required', 'regex:/^[A-Z]{3}$/D'], 'minor_unit_digits' => 'required|integer:strict|min:0|max:4',
                'principal_min_minor' => 'required|integer:strict|min:1|max:1000000000', 'principal_max_minor' => 'required|integer:strict|gte:principal_min_minor|max:1000000000',
                'term_rate_numerator' => 'required|integer:strict|min:0|max:1000000|lte:term_rate_denominator', 'term_rate_denominator' => 'required|integer:strict|min:1|max:1000000',
                'installment_count' => 'required|integer:strict|min:1|max:120', 'interval_days' => 'required|integer:strict|min:1|max:365'];
            if ($action === 'create') {
                $rules['code'] = ['required', 'regex:/^[a-z][a-z0-9-]{0,59}$/D', Rule::unique('lending_products', 'code')->where('organization_id', $scope->organizationId)];
            } else {
                $rules += ['expected_version' => 'required|integer:strict|min:0', 'status' => ['required', Rule::in(array_keys(Product::options()))]];
            }
            $data = $this->validate($input, $rules);
            abort_if($data['installment_count'] * $data['interval_days'] > 3650, 422, 'The configured term exceeds 3650 days.');
            if ($action !== 'create') {
                $this->version($product, $data['expected_version']);
                unset($data['expected_version']);
                $product->version++;
            }
            $product->fill($data);
            if ($action === 'create') {
                try {
                    // A savepoint keeps PostgreSQL usable after a competing insert wins.
                    DB::transaction(fn () => $product->save());
                } catch (QueryException $error) {
                    $this->productCodeConflictOrThrow($error);
                }
            } else {
                $product->save();
            }
        }

        return ['product' => $product->toArray(), 'options' => Product::options()];
    }

    private function product(AuthorizedLendingScope $scope, ?int $id): Product
    {
        return Product::where('organization_id', $scope->organizationId)->lockForUpdate()->findOrFail($id);
    }

    private function applicationRules(): array
    {
        return ['principal_minor' => 'required|integer:strict|min:1|max:1000000000', 'first_due_date' => 'required|date_format:Y-m-d', 'purpose' => 'required|string|min:1|max:2000'];
    }

    private function eligibleTerms(Product $product, array $data): void
    {
        abort_unless($product->status === Product::Active, 403, 'Only active products accept applications.');
        abort_if($data['principal_minor'] < $product->principal_min_minor || $data['principal_minor'] > $product->principal_max_minor, 422, 'Principal is outside the product bounds.');
        $this->futureDate($data['first_due_date']);
    }

    private function futureDate(string $date): void
    {
        abort_if($date < CarbonImmutable::now('UTC')->format('Y-m-d'), 422, 'The first due date must be today or later in UTC.');
    }

    private function version(Model $record, int $version): void
    {
        abort_unless($record->version === $version, 409, 'The record changed. Reload its version.');
    }

    private function productCodeConflictOrThrow(QueryException $error): never
    {
        $message = $error->getMessage();
        $codeConflict = in_array((string) $error->getCode(), ['23505', '23000', '19'], true)
            && (str_contains($message, 'lending_products_organization_id_code_unique')
                || str_contains($message, 'lending_products.organization_id, lending_products.code'));
        if ($codeConflict) {
            throw ValidationException::withMessages(['code' => 'The code is already in use for this organization.']);
        }

        throw $error;
    }

    private function applicationResult(Application $application): array
    {
        return ['application' => $application->toArray(), 'options' => Application::options()];
    }

    private function validate(array $input, array $rules): array
    {
        foreach (['page', 'per_page'] as $field) {
            if (isset($rules[$field], $input[$field]) && is_string($input[$field]) && preg_match('/^[1-9][0-9]{0,6}$/D', $input[$field])) {
                $input[$field] = (int) $input[$field];
            }
        }
        foreach (array_diff(array_keys($input), array_keys($rules)) as $field) {
            throw ValidationException::withMessages([$field => 'Unknown field.']);
        }

        return Validator::make($input, $rules)->validate();
    }
}
