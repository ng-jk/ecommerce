<?php

namespace Tests\Feature;

use App\Modules\Builder\AuthorizedBuilderScope;
use App\Modules\Builder\BuilderActions;
use App\Modules\Builder\Models\Page;
use App\Modules\Crm\AuthorizedCrmScope;
use App\Modules\Crm\CrmActions;
use App\Modules\Erp\AuthorizedErpScope;
use App\Modules\Erp\ErpActions;
use App\Modules\Hr\AuthorizedHrScope;
use App\Modules\Hr\HrActions;
use App\Modules\Hr\Models\HrEmployee;
use App\Modules\Lending\AuthorizedLendingScope;
use App\Modules\Lending\LendingActions;
use App\Modules\Lending\Models\LendingApplication;
use App\Modules\Lending\Models\LendingProduct;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;
use Tests\TestCase;

class DomainResultAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['builder', 'hr', 'lending'] as $service) {
            Artisan::call('migrate', ['--path' => 'database/migrations/services/'.$service, '--force' => true]);
        }
    }

    private function scope(string $service, string $action): mixed
    {
        $class = match ($service) {
            'crm' => AuthorizedCrmScope::class, 'erp' => AuthorizedErpScope::class,
            'builder' => AuthorizedBuilderScope::class, 'hr' => AuthorizedHrScope::class,
            'lending' => AuthorizedLendingScope::class,
        };

        return $class::fromVerifiedExchange(['id' => (string) Str::uuid(), 'source' => 'platform',
            'destination' => $service, 'topic' => $service.'.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 11, 'organization_id' => 7,
                'application' => $service, 'action' => $service.'.'.$action, 'auth_version' => 0, 'token_id' => 43],
                'command' => ['input' => [], 'operation_id' => (string) Str::uuid()]]], fn (): bool => true);
    }

    public function test_organization_wide_policies_and_published_builder_retraction(): void
    {
        $this->assertTrue(app(CrmActions::class)->authorizeResult($this->scope('crm', 'companies.list'), [], []));
        $this->assertFalse(app(CrmActions::class)->authorizeResult($this->scope('crm', 'unknown.list'), [], []));
        $this->assertTrue(app(ErpActions::class)->authorizeResult($this->scope('erp', 'ledger.list'), [], []));
        $this->assertTrue(app(BuilderActions::class)->authorizeResult($this->scope('builder', 'pages.list'), [], []));
        $page = Page::factory()->create(['organization_id' => 7, 'published_version' => 0]);
        $guard = app(BuilderActions::class);
        $scope = $this->scope('builder', 'pages.render');
        $this->assertTrue($guard->authorizeResult($scope, ['id' => $page->id], []));
        $page->update(['published_version' => null]);
        $this->assertFalse($guard->authorizeResult($scope, ['id' => $page->id], []));
        $this->assertFalse($guard->authorizeResult($scope, [], []));
    }

    public function test_hr_employee_disable_revokes_old_self_results(): void
    {
        $guard = app(HrActions::class);
        $scope = $this->scope('hr', 'employees.mine.detail');
        $this->assertFalse($guard->authorizeResult($scope, [], []));
        $employee = HrEmployee::create(['organization_id' => 7, 'code' => 'emp-001',
            'display_name' => 'Employee', 'linked_platform_user_id' => 11, 'timezone' => 'UTC']);
        $this->assertTrue($guard->authorizeResult($scope, [], []));
        $this->assertTrue($guard->authorizeResult($this->scope('hr', 'attendance.record'), [], []));
        $employee->update(['status' => HrEmployee::Inactive]);
        $this->assertFalse($guard->authorizeResult($scope, [], []));
        $this->assertTrue($guard->authorizeResult($this->scope('hr', 'employees.list'), [], []));
    }

    public function test_lending_saved_result_never_crosses_applicant_or_organization(): void
    {
        $product = LendingProduct::create(['organization_id' => 7, 'code' => 'loan-001', 'name' => 'Terms',
            'jurisdiction_label' => 'Example', 'terms_text' => 'Example only', 'currency' => 'MYR',
            'minor_unit_digits' => 2, 'principal_min_minor' => 1, 'principal_max_minor' => 1000,
            'term_rate_numerator' => 0, 'term_rate_denominator' => 1, 'installment_count' => 1, 'interval_days' => 30]);
        $row = LendingApplication::create(['organization_id' => 7, 'applicant_platform_user_id' => 11,
            'product_id' => $product->id, 'principal_minor' => 100, 'first_due_date' => '2026-12-01', 'purpose' => 'Example']);
        $scope = $this->scope('lending', 'applications.detail');
        $guard = app(LendingActions::class);
        $this->assertTrue($guard->authorizeResult($scope, [], ['application' => ['id' => $row->id]]));
        $this->assertTrue($guard->authorizeResult($scope, [], ['application_id' => $row->id]));
        $this->assertTrue($guard->authorizeResult($scope, [], ['data' => [['id' => $row->id], ['id' => $row->id]]]));
        $this->assertTrue($guard->authorizeResult($scope, [], ['data' => []]));
        $this->assertFalse($guard->authorizeResult($scope, [], []));
        $row->update(['applicant_platform_user_id' => 12]);
        $this->assertFalse($guard->authorizeResult($scope, [], ['application' => ['id' => $row->id]]));
        $row->update(['applicant_platform_user_id' => 11, 'organization_id' => 8]);
        $this->assertFalse($guard->authorizeResult($scope, [], ['data' => [['id' => $row->id]]]));
        $this->assertTrue($guard->authorizeResult($this->scope('lending', 'reviews.list'), [], []));
    }
}
