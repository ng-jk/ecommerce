<?php

namespace Tests\Feature;

use App\Modules\Crm\AuthorizedCrmScope;
use App\Modules\Crm\CrmActions;
use App\Modules\Crm\Models\Company;
use App\Modules\Crm\Models\Contact;
use App\Modules\Crm\Models\Lead;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use LogicException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;

class CrmActionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/crm', '--force' => true]);
    }

    private function envelope(string $action, int $organizationId = 7, int $actorId = 11): array
    {
        return ['id' => 'e37a3e1e-62df-4b13-bbbf-fc0963f5c189', 'source' => 'platform',
            'destination' => 'crm', 'topic' => 'crm.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => $actorId, 'organization_id' => $organizationId,
                'application' => 'crm', 'action' => $action, 'auth_version' => 0, 'token_id' => 43],
                'command' => ['input' => [], 'operation_id' => '3b630bea-44aa-4567-91c7-d61d70161802']]];
    }

    private function scope(string $action, int $organizationId = 7, int $actorId = 11): AuthorizedCrmScope
    {
        return AuthorizedCrmScope::fromVerifiedExchange($this->envelope($action, $organizationId, $actorId), fn () => true);
    }

    private function runAction(string $action, array $input = [], ?int $id = null, int $organizationId = 7, int $actorId = 11): array
    {
        return app(CrmActions::class)->execute($this->scope($action, $organizationId, $actorId), $input, $id);
    }

    public function test_scope_requires_exact_envelope_and_verified_central_authorization(): void
    {
        $seen = null;
        $scope = AuthorizedCrmScope::fromVerifiedExchange($this->envelope('crm.leads.list'), function (array $payload) use (&$seen): bool {
            $seen = $payload;

            return true;
        });
        $this->assertSame([7, 11, 'crm.leads.list'], [$scope->organizationId, $scope->platformUserId, $scope->action]);
        $this->assertSame('crm', $seen['application']);
        $this->assertNull(AuthorizedCrmScope::fromVerifiedExchange($this->envelope('crm.leads.list'), fn () => false));
        foreach (['source' => 'browser', 'version' => 2, 'id' => 'bad'] as $field => $value) {
            $envelope = $this->envelope('crm.leads.list');
            $envelope[$field] = $value;
            $this->assertInvalidEnvelope($envelope);
        }
        $envelope = $this->envelope('crm.leads.list');
        $envelope['payload']['scope']['application'] = 'inventory';
        $this->assertInvalidEnvelope($envelope);
        $envelope = $this->envelope('crm.leads.list');
        $envelope['payload']['scope']['platform_user_id'] = 0;
        $this->assertInvalidEnvelope($envelope);
        $envelope = $this->envelope('crm.leads.list');
        $envelope['payload']['command']['id'] = '1';
        $this->assertInvalidEnvelope($envelope);
        $envelope = $this->envelope('crm.leads.list');
        $envelope['payload']['command']['grant'] = true;
        $this->assertInvalidEnvelope($envelope);
        $envelope = $this->envelope('crm.leads.list');
        $envelope['payload']['extra'] = true;
        $this->assertInvalidEnvelope($envelope);
        try {
            AuthorizedCrmScope::fromVerifiedExchange($this->envelope('crm.leads.list'), fn () => 'yes');
            $this->fail('Nonboolean authorization accepted');
        } catch (LogicException) {
            $this->assertTrue(true);
        }
    }

    private function assertInvalidEnvelope(array $envelope): void
    {
        try {
            AuthorizedCrmScope::fromVerifiedExchange($envelope, fn () => true);
            $this->fail('Invalid envelope accepted');
        } catch (InvalidArgumentException) {
            $this->assertTrue(true);
        }
    }

    public function test_directories_are_scoped_paginated_index_filtered_and_versioned(): void
    {
        $first = $this->runAction('crm.companies.create', ['code' => ' AcMe ', 'name' => ' Acme '])['company'];
        $second = $this->runAction('crm.companies.create', ['code' => 'other', 'name' => 'Other'])['company'];
        $this->runAction('crm.companies.create', ['code' => 'acme', 'name' => 'Other tenant'], null, 8);
        $this->assertSame('acme', $first['code']);
        $this->assertSame('Acme', $first['name']);
        $this->assertSame([$first['id']], array_column($this->runAction('crm.companies.list', ['code' => 'ACME'])['data'], 'id'));
        $page = $this->runAction('crm.companies.list', ['per_page' => '1', 'page' => '2']);
        $this->assertSame([$second['id']], array_column($page['data'], 'id'));
        $this->assertSame(2, $page['meta']['total']);
        $this->assertArrayNotHasKey('organization_id', $page['data'][0]);
        $this->assertArrayNotHasKey('created_by_platform_user_id', $page['data'][0]);
        $this->assertSame($first, $this->runAction('crm.companies.detail', [], $first['id'])['company']);
        $updated = $this->runAction('crm.companies.update', ['name' => 'New Acme', 'expected_version' => 0], $first['id'], 7, 12)['company'];
        $this->assertSame(1, $updated['version']);
        $this->assertSame(12, Company::find($first['id'])->updated_by_platform_user_id);

        $contact = $this->runAction('crm.contacts.create', ['name' => ' Alice ', 'email' => ' Alice@Example.COM ', 'company_id' => $first['id']])['contact'];
        $this->runAction('crm.contacts.create', ['name' => 'Bob', 'email' => 'bob@example.com', 'company_id' => $second['id']]);
        $this->assertSame('alice@example.com', $contact['email']);
        $this->assertSame($contact, $this->runAction('crm.contacts.detail', [], $contact['id'])['contact']);
        $this->assertSame([$contact['id']], array_column($this->runAction('crm.contacts.list', ['company_id' => $first['id']])['data'], 'id'));
        $this->assertSame(2, $this->runAction('crm.contacts.list')['meta']['total']);
        $changed = $this->runAction('crm.contacts.update', ['name' => 'Alice A', 'email' => 'alice.a@example.com', 'company_id' => null,
            'expected_version' => 0], $contact['id'], 7, 12)['contact'];
        $this->assertSame(1, $changed['version']);
        $this->assertNull($changed['company_id']);
        $this->assertSame(12, Contact::find($contact['id'])->updated_by_platform_user_id);
        $this->assertNull(Contact::find($contact['id'])->company);
        $this->assertCount(0, Company::find($first['id'])->contacts);
    }

    public function test_uniqueness_and_cross_tenant_references_fail_closed(): void
    {
        $company = $this->runAction('crm.companies.create', ['code' => 'acme', 'name' => 'A'])['company'];
        $other = $this->runAction('crm.companies.create', ['code' => 'other', 'name' => 'B'], null, 8)['company'];
        $this->assertValidation('code', fn () => $this->runAction('crm.companies.create', ['code' => 'ACME', 'name' => 'Duplicate']));
        $contact = $this->runAction('crm.contacts.create', ['name' => 'A', 'email' => 'a@example.com', 'company_id' => $company['id']])['contact'];
        $this->assertValidation('email', fn () => $this->runAction('crm.contacts.create', ['name' => 'B', 'email' => 'A@EXAMPLE.COM', 'company_id' => null]));
        $this->runAction('crm.contacts.create', ['name' => 'Other', 'email' => 'a@example.com', 'company_id' => $other['id']], null, 8);
        $secondContact = $this->runAction('crm.contacts.create', ['name' => 'Second', 'email' => 'second@example.com', 'company_id' => null])['contact'];
        $this->assertValidation('email', fn () => $this->runAction('crm.contacts.update', ['name' => 'Second',
            'email' => 'A@EXAMPLE.COM', 'company_id' => null, 'expected_version' => 0], $secondContact['id']));
        foreach ([['crm.companies.detail', [], $other['id']], ['crm.companies.update', ['name' => 'Wrong', 'expected_version' => 0], $other['id']],
            ['crm.contacts.detail', [], $contact['id'] + 1]] as [$action, $input, $id]) {
            $this->assertNotFound(fn () => $this->runAction($action, $input, $id));
        }
        $this->assertNotFound(fn () => $this->runAction('crm.contacts.create', ['name' => 'Bad', 'email' => 'bad@example.com', 'company_id' => $other['id']]));
    }

    public function test_lead_workflow_filters_conversion_and_terminal_guards(): void
    {
        $company = $this->runAction('crm.companies.create', ['code' => 'target', 'name' => 'Target'])['company'];
        $lead = $this->runAction('crm.leads.create', ['name' => ' Jane ', 'email' => ' JANE@EXAMPLE.COM ', 'company_id' => $company['id']])['lead'];
        $this->assertSame('new', $lead['status']);
        $this->assertSame('jane@example.com', $lead['email']);
        $this->assertSame(Lead::options(), $this->runAction('crm.leads.detail', [], $lead['id'])['options']['status']);
        $this->assertSame([$lead['id']], array_column($this->runAction('crm.leads.list', ['status' => 'new', 'company_id' => $company['id']])['data'], 'id'));
        $this->assertSame([], $this->runAction('crm.leads.list', ['status' => 'lost'])['data']);
        $contacted = $this->runAction('crm.leads.update', ['name' => 'Jane', 'email' => 'jane@example.com', 'company_id' => $company['id'],
            'status' => 'contacted', 'expected_version' => 0], $lead['id'])['lead'];
        $qualified = $this->runAction('crm.leads.update', ['name' => 'Jane', 'email' => 'jane@example.com', 'company_id' => $company['id'],
            'status' => 'qualified', 'expected_version' => $contacted['version']], $lead['id'])['lead'];
        $converted = $this->runAction('crm.leads.convert', ['expected_version' => $qualified['version']], $lead['id']);
        $this->assertSame('converted', $converted['lead']['status']);
        $this->assertSame($converted['contact']['id'], $converted['lead']['contact_id']);
        $this->assertSame(1, Contact::where('organization_id', 7)->count());
        $this->assertSame(11, Contact::find($converted['contact']['id'])->created_by_platform_user_id);
        $this->assertSame($company['id'], Lead::find($lead['id'])->company->id);
        $this->assertSame($converted['contact']['id'], Lead::find($lead['id'])->contact->id);
        $this->assertSame($lead['id'], Company::find($company['id'])->leads->first()->id);
        $this->assertConflict(fn () => $this->runAction('crm.leads.convert', ['expected_version' => $converted['lead']['version']], $lead['id']));
        $this->assertConflict(fn () => $this->runAction('crm.leads.update', ['name' => 'Again', 'email' => 'jane@example.com',
            'company_id' => $company['id'], 'status' => 'converted', 'expected_version' => $converted['lead']['version']], $lead['id']));
    }

    public function test_conversion_reuses_matching_contact_and_rejects_conflicting_company(): void
    {
        $one = $this->runAction('crm.companies.create', ['code' => 'one', 'name' => 'One'])['company'];
        $two = $this->runAction('crm.companies.create', ['code' => 'two', 'name' => 'Two'])['company'];
        $contact = $this->runAction('crm.contacts.create', ['name' => 'Existing', 'email' => 'reuse@example.com', 'company_id' => $one['id']])['contact'];
        $lead = Lead::factory()->create(['organization_id' => 7, 'company_id' => $one['id'], 'email' => 'reuse@example.com', 'status' => Lead::Qualified]);
        $converted = $this->runAction('crm.leads.convert', ['expected_version' => 0], $lead->id);
        $this->assertSame($contact['id'], $converted['contact']['id']);
        $this->assertSame(1, Contact::where('organization_id', 7)->count());
        $conflicting = Lead::factory()->create(['organization_id' => 7, 'company_id' => $two['id'], 'email' => 'reuse@example.com', 'status' => Lead::Qualified]);
        $this->assertConflict(fn () => $this->runAction('crm.leads.convert', ['expected_version' => 0], $conflicting->id));
        $this->assertSame(Lead::Qualified, $conflicting->fresh()->status);
        $this->assertNull($conflicting->fresh()->contact_id);
    }

    public function test_versions_transitions_and_validation_fail_closed(): void
    {
        $lead = $this->runAction('crm.leads.create', ['name' => 'A', 'email' => 'a@example.com', 'company_id' => null])['lead'];
        $company = $this->runAction('crm.companies.create', ['code' => 'acme', 'name' => 'A'])['company'];
        $contact = $this->runAction('crm.contacts.create', ['name' => 'A', 'email' => 'a@example.com', 'company_id' => null])['contact'];
        foreach ([['crm.companies.update', $company['id'], ['name' => 'B', 'expected_version' => 1]],
            ['crm.contacts.update', $contact['id'], ['name' => 'B', 'email' => 'b@example.com', 'company_id' => null, 'expected_version' => 1]],
            ['crm.leads.update', $lead['id'], ['name' => 'B', 'email' => 'b@example.com', 'company_id' => null, 'status' => 'qualified', 'expected_version' => 0]],
            ['crm.leads.convert', $lead['id'], ['expected_version' => 0]]] as [$action, $id, $input]) {
            $this->assertConflict(fn () => $this->runAction($action, $input, $id));
        }
        foreach ([['crm.companies.create', ['code' => 'bad', 'name' => '  ']],
            ['crm.contacts.create', ['name' => 'A', 'email' => 'not-email', 'company_id' => null]],
            ['crm.leads.create', ['name' => 'A', 'email' => 'a@example.com', 'company_id' => null, 'status' => 'converted']],
            ['crm.leads.list', ['per_page' => 51]], ['crm.contacts.list', ['private' => true]]] as [$action, $input]) {
            try {
                $this->runAction($action, $input);
                $this->fail('Invalid field accepted');
            } catch (ValidationException) {
                $this->assertTrue(true);
            }
        }
        $this->assertSame(Lead::New, Lead::find($lead['id'])->status);
        $this->assertValidation('name', fn () => $this->runAction('crm.contacts.create', ['name' => '  ', 'email' => 'other@example.com', 'company_id' => null]));
    }

    public function test_unrelated_database_failure_is_not_misreported_as_a_duplicate(): void
    {
        Company::creating(fn () => DB::table('crm_missing_table')->insert(['id' => 1]));
        try {
            $this->runAction('crm.companies.create', ['code' => 'broken', 'name' => 'Broken']);
            $this->fail('Database failure was accepted');
        } catch (QueryException $exception) {
            $this->assertStringContainsString('crm_missing_table', $exception->getMessage());
        }
    }

    public function test_crm_factory_relations_are_scoped_to_local_domain_models(): void
    {
        $company = Company::factory()->create(['organization_id' => 7]);
        $contact = Contact::factory()->create(['organization_id' => 7, 'company_id' => $company->id]);
        $this->assertSame($company->id, $contact->company->id);
    }

    private function assertValidation(string $field, callable $callback): void
    {
        try {
            $callback();
            $this->fail('Duplicate accepted');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey($field, $exception->errors());
        }
    }

    private function assertNotFound(callable $callback): void
    {
        try {
            $callback();
            $this->fail('Cross-tenant reference accepted');
        } catch (NotFoundHttpException|ModelNotFoundException) {
            $this->assertTrue(true);
        }
    }

    private function assertConflict(callable $callback): void
    {
        try {
            $callback();
            $this->fail('Conflict accepted');
        } catch (HttpException $exception) {
            $this->assertSame(409, $exception->getStatusCode());
        }
    }

    public function test_action_requires_transaction_and_known_action(): void
    {
        DB::rollBack();
        try {
            app(CrmActions::class)->execute($this->scope('crm.leads.list'), []);
            $this->fail('Unfenced CRM action accepted');
        } catch (LogicException) {
            $this->assertTrue(true);
        } finally {
            DB::beginTransaction();
        }
        try {
            $this->runAction('crm.billing.list');
            $this->fail('Unknown action accepted');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
        try {
            $this->runAction('crm.leads.list', [], 1);
            $this->fail('List accepted target');
        } catch (HttpException $exception) {
            $this->assertSame(422, $exception->getStatusCode());
        }
    }
}
