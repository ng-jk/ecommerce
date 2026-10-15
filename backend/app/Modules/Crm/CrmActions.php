<?php

namespace App\Modules\Crm;

use App\Modules\Crm\Models\Company;
use App\Modules\Crm\Models\Contact;
use App\Modules\Crm\Models\Lead;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use LogicException;

final class CrmActions
{
    public function __construct(private readonly CrmDealActions $dealActions) {}

    public function authorizeResult(AuthorizedCrmScope $scope, array $command, array $result): bool
    {
        // CRM currently has organization-wide visibility; the signed scope has
        // already rechecked the current role, installation and entitlement.
        return in_array($scope->action, [
            'crm.companies.list', 'crm.companies.create', 'crm.companies.detail', 'crm.companies.update',
            'crm.contacts.list', 'crm.contacts.create', 'crm.contacts.detail', 'crm.contacts.update',
            'crm.leads.list', 'crm.leads.create', 'crm.leads.detail', 'crm.leads.update', 'crm.leads.convert',
            'crm.pipelines.list', 'crm.pipelines.create', 'crm.pipelines.detail', 'crm.pipelines.update',
            'crm.stages.list', 'crm.stages.create', 'crm.stages.detail', 'crm.stages.update',
            'crm.deals.list', 'crm.deals.create', 'crm.deals.detail', 'crm.deals.update', 'crm.deals.advance',
            'crm.activities.list', 'crm.activities.create', 'crm.activities.detail',
        ], true);
    }

    public function execute(AuthorizedCrmScope $scope, array $input, ?int $id = null): array
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('CRM actions require a fenced inbox transaction.');
        }
        abort_if($id !== null && $id < 1, 404);
        abort_if($id !== null && in_array($scope->action, ['crm.companies.list', 'crm.companies.create',
            'crm.contacts.list', 'crm.contacts.create', 'crm.leads.list', 'crm.leads.create'], true), 422);
        $organizationId = $scope->organizationId;

        return match ($scope->action) {
            'crm.companies.list' => $this->companies($organizationId, $input),
            'crm.companies.create' => $this->createCompany($organizationId, $scope->platformUserId, $input),
            'crm.companies.detail' => $this->company($organizationId, $this->requiredId($id), $input),
            'crm.companies.update' => $this->updateCompany($organizationId, $scope->platformUserId, $this->requiredId($id), $input),
            'crm.contacts.list' => $this->contacts($organizationId, $input),
            'crm.contacts.create' => $this->createContact($organizationId, $scope->platformUserId, $input),
            'crm.contacts.detail' => $this->contact($organizationId, $this->requiredId($id), $input),
            'crm.contacts.update' => $this->updateContact($organizationId, $scope->platformUserId, $this->requiredId($id), $input),
            'crm.leads.list' => $this->leads($organizationId, $input),
            'crm.leads.create' => $this->createLead($organizationId, $scope->platformUserId, $input),
            'crm.leads.detail' => $this->lead($organizationId, $this->requiredId($id), $input),
            'crm.leads.update' => $this->updateLead($organizationId, $scope->platformUserId, $this->requiredId($id), $input),
            'crm.leads.convert' => $this->convertLead($organizationId, $scope->platformUserId, $this->requiredId($id), $input),
            'crm.pipelines.list', 'crm.pipelines.create', 'crm.pipelines.detail', 'crm.pipelines.update',
            'crm.stages.list', 'crm.stages.create', 'crm.stages.detail', 'crm.stages.update',
            'crm.deals.list', 'crm.deals.create', 'crm.deals.detail', 'crm.deals.update', 'crm.deals.advance',
            'crm.activities.list', 'crm.activities.create', 'crm.activities.detail' => $this->dealActions->execute($scope, $input, $id),
            default => abort(403, 'CRM action is unavailable.'),
        };
    }

    private function companies(int $organizationId, array $input): array
    {
        $data = $this->validated($input, [
            'page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50',
            'code' => 'sometimes|string|min:3|max:80',
        ]);
        $query = Company::query()->where('organization_id', $organizationId);
        if (isset($data['code'])) {
            $query->whereRaw('lower(code) = ?', [strtolower(trim($data['code']))]);
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20),
            ['id', 'code', 'name', 'version'], 'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (Company $company): array => $this->publicCompany($company))->all(),
            'meta' => $this->meta($page)];
    }

    private function createCompany(int $organizationId, int $actorId, array $input): array
    {
        $data = $this->validated($input, [
            'code' => ['required', 'string', 'min:3', 'max:80', 'regex:/^[a-z][a-z0-9-]*$/D'],
            'name' => 'required|string|min:1|max:200',
        ], ['code']);
        try {
            $company = DB::transaction(fn (): Company => Company::create([
                'organization_id' => $organizationId, 'code' => $data['code'], 'name' => trim($data['name']),
                'created_by_platform_user_id' => $actorId, 'updated_by_platform_user_id' => $actorId,
            ]));
        } catch (QueryException $error) {
            $this->uniqueOrThrow($error, 'code');
        }

        return ['company' => $this->publicCompany($company)];
    }

    private function company(int $organizationId, int $id, array $input): array
    {
        $this->validated($input, []);
        $company = Company::query()->where('organization_id', $organizationId)->findOrFail($id);

        return ['company' => $this->publicCompany($company)];
    }

    private function updateCompany(int $organizationId, int $actorId, int $id, array $input): array
    {
        $data = $this->validated($input, [
            'name' => 'required|string|min:1|max:200',
            'expected_version' => 'required|integer:strict|min:0',
        ]);
        $company = Company::query()->where('organization_id', $organizationId)->lockForUpdate()->findOrFail($id);
        $this->version($company->version, $data['expected_version']);
        $company->update(['name' => trim($data['name']), 'version' => $company->version + 1,
            'updated_by_platform_user_id' => $actorId]);

        return ['company' => $this->publicCompany($company)];
    }

    private function contacts(int $organizationId, array $input): array
    {
        $data = $this->validated($input, [
            'page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50',
            'company_id' => 'sometimes|integer:strict|min:1',
        ]);
        $query = Contact::query()->where('organization_id', $organizationId);
        if (isset($data['company_id'])) {
            $query->where('company_id', $data['company_id']);
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20),
            ['id', 'company_id', 'name', 'email', 'version'], 'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (Contact $contact): array => $this->publicContact($contact))->all(),
            'meta' => $this->meta($page)];
    }

    private function createContact(int $organizationId, int $actorId, array $input): array
    {
        $data = $this->validated($input, [
            'name' => 'required|string|min:1|max:200',
            'email' => 'required|email:rfc|max:254|regex:/^[\x21-\x7e]+$/D',
            'company_id' => 'present|nullable|integer:strict|min:1',
        ], ['email']);
        $this->companyReference($organizationId, $data['company_id']);
        try {
            $contact = DB::transaction(fn (): Contact => Contact::create([
                'organization_id' => $organizationId, 'company_id' => $data['company_id'],
                'name' => trim($data['name']), 'email' => $data['email'],
                'created_by_platform_user_id' => $actorId, 'updated_by_platform_user_id' => $actorId,
            ]));
        } catch (QueryException $error) {
            $this->uniqueOrThrow($error, 'email');
        }

        return ['contact' => $this->publicContact($contact)];
    }

    private function contact(int $organizationId, int $id, array $input): array
    {
        $this->validated($input, []);
        $contact = Contact::query()->where('organization_id', $organizationId)->findOrFail($id);

        return ['contact' => $this->publicContact($contact)];
    }

    private function updateContact(int $organizationId, int $actorId, int $id, array $input): array
    {
        $data = $this->validated($input, [
            'name' => 'required|string|min:1|max:200',
            'email' => 'required|email:rfc|max:254|regex:/^[\x21-\x7e]+$/D',
            'company_id' => 'present|nullable|integer:strict|min:1',
            'expected_version' => 'required|integer:strict|min:0',
        ], ['email']);
        $this->companyReference($organizationId, $data['company_id']);
        $contact = Contact::query()->where('organization_id', $organizationId)->lockForUpdate()->findOrFail($id);
        $this->version($contact->version, $data['expected_version']);
        try {
            DB::transaction(fn () => $contact->update([
                'name' => trim($data['name']), 'email' => $data['email'],
                'company_id' => $data['company_id'], 'version' => $contact->version + 1,
                'updated_by_platform_user_id' => $actorId,
            ]));
        } catch (QueryException $error) {
            $this->uniqueOrThrow($error, 'email');
        }

        return ['contact' => $this->publicContact($contact)];
    }

    private function leads(int $organizationId, array $input): array
    {
        $data = $this->validated($input, [
            'page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50',
            'status' => ['sometimes', Rule::in(array_keys(Lead::options()))],
            'company_id' => 'sometimes|integer:strict|min:1',
        ]);
        $query = Lead::query()->where('organization_id', $organizationId);
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }
        if (isset($data['company_id'])) {
            $query->where('company_id', $data['company_id']);
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20),
            ['id', 'company_id', 'contact_id', 'name', 'email', 'status', 'version'],
            'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (Lead $lead): array => $this->publicLead($lead))->all(),
            'meta' => [...$this->meta($page), 'options' => ['status' => Lead::options()]]];
    }

    private function createLead(int $organizationId, int $actorId, array $input): array
    {
        $data = $this->validated($input, [
            'name' => 'required|string|min:1|max:200',
            'email' => 'required|email:rfc|max:254|regex:/^[\x21-\x7e]+$/D',
            'company_id' => 'present|nullable|integer:strict|min:1',
        ], ['email']);
        $this->companyReference($organizationId, $data['company_id']);
        $lead = Lead::create(['organization_id' => $organizationId, 'company_id' => $data['company_id'],
            'name' => trim($data['name']), 'email' => $data['email'],
            'created_by_platform_user_id' => $actorId, 'updated_by_platform_user_id' => $actorId]);

        return $this->leadResult($lead);
    }

    private function lead(int $organizationId, int $id, array $input): array
    {
        $this->validated($input, []);
        $lead = Lead::query()->where('organization_id', $organizationId)->findOrFail($id);

        return $this->leadResult($lead);
    }

    private function updateLead(int $organizationId, int $actorId, int $id, array $input): array
    {
        $data = $this->validated($input, [
            'name' => 'required|string|min:1|max:200',
            'email' => 'required|email:rfc|max:254|regex:/^[\x21-\x7e]+$/D',
            'company_id' => 'present|nullable|integer:strict|min:1',
            'status' => ['required', Rule::in(array_keys(Lead::options()))],
            'expected_version' => 'required|integer:strict|min:0',
        ], ['email']);
        $this->companyReference($organizationId, $data['company_id']);
        $lead = Lead::query()->where('organization_id', $organizationId)->lockForUpdate()->findOrFail($id);
        $this->version($lead->version, $data['expected_version']);
        $this->transition($lead->status, $data['status']);
        $lead->update(['name' => trim($data['name']), 'email' => $data['email'], 'company_id' => $data['company_id'],
            'status' => $data['status'], 'version' => $lead->version + 1,
            'updated_by_platform_user_id' => $actorId]);

        return $this->leadResult($lead);
    }

    private function convertLead(int $organizationId, int $actorId, int $id, array $input): array
    {
        $data = $this->validated($input, ['expected_version' => 'required|integer:strict|min:0']);
        $lead = Lead::query()->where('organization_id', $organizationId)->lockForUpdate()->findOrFail($id);
        $this->version($lead->version, $data['expected_version']);
        abort_unless($lead->status === Lead::Qualified, 409, 'Only a qualified lead can be converted.');
        $this->companyReference($organizationId, $lead->company_id);
        $contact = Contact::query()->where('organization_id', $organizationId)->whereRaw('lower(email) = ?', [$lead->email])
            ->lockForUpdate()->first();
        if (! $contact) {
            DB::table('crm_contacts')->insertOrIgnore([
                'organization_id' => $organizationId, 'company_id' => $lead->company_id,
                'name' => $lead->name, 'email' => $lead->email, 'version' => 0,
                'created_by_platform_user_id' => $actorId, 'updated_by_platform_user_id' => $actorId,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $contact = Contact::query()->where('organization_id', $organizationId)->whereRaw('lower(email) = ?', [$lead->email])
                ->lockForUpdate()->first();
            abort_unless($contact, 409, 'Contact changed. Refresh before retrying.');
        }
        abort_unless($contact->company_id === $lead->company_id, 409, 'Contact belongs to another company.');
        $lead->update(['contact_id' => $contact->id, 'status' => Lead::Converted, 'version' => $lead->version + 1,
            'updated_by_platform_user_id' => $actorId]);

        return ['lead' => $this->publicLead($lead), 'contact' => $this->publicContact($contact),
            'options' => ['status' => Lead::options()]];
    }

    private function transition(string $before, string $after): void
    {
        $allowed = match ($before) {
            Lead::New => [Lead::New, Lead::Contacted, Lead::Lost],
            Lead::Contacted => [Lead::Contacted, Lead::Qualified, Lead::Lost],
            Lead::Qualified => [Lead::Qualified, Lead::Lost],
            default => [],
        };
        abort_unless(in_array($after, $allowed, true), 409, 'Lead transition is unavailable.');
    }

    private function companyReference(int $organizationId, ?int $id): void
    {
        if ($id !== null) {
            Company::query()->where('organization_id', $organizationId)->lockForUpdate()->findOrFail($id);
        }
    }

    private function version(int $current, int $expected): void
    {
        abort_unless($current === $expected, 409, 'The CRM record changed. Refresh before retrying.');
    }

    private function requiredId(?int $id): int
    {
        abort_unless($id !== null, 404);

        return $id;
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
        foreach (['page', 'per_page', 'company_id'] as $field) {
            if (isset($input[$field]) && is_string($input[$field]) && preg_match('/^[1-9][0-9]*$/D', $input[$field])) {
                $input[$field] = (int) $input[$field];
            }
        }

        return Validator::make($input, $rules)->validate();
    }

    private function uniqueOrThrow(QueryException $error, string $field): never
    {
        if ($this->isUnique($error)) {
            throw ValidationException::withMessages([$field => 'The value is already in use.']);
        }

        throw $error;
    }

    private function isUnique(QueryException $error): bool
    {
        return in_array($error->getCode(), ['23505', '23000', '19'], true);
    }

    private function publicCompany(Company $company): array
    {
        return ['id' => $company->id, 'code' => $company->code, 'name' => $company->name, 'version' => $company->version];
    }

    private function publicContact(Contact $contact): array
    {
        return ['id' => $contact->id, 'company_id' => $contact->company_id, 'name' => $contact->name,
            'email' => $contact->email, 'version' => $contact->version];
    }

    private function publicLead(Lead $lead): array
    {
        return ['id' => $lead->id, 'company_id' => $lead->company_id, 'contact_id' => $lead->contact_id,
            'name' => $lead->name, 'email' => $lead->email, 'status' => $lead->status, 'version' => $lead->version];
    }

    private function leadResult(Lead $lead): array
    {
        return ['lead' => $this->publicLead($lead), 'options' => ['status' => Lead::options()]];
    }

    private function meta(LengthAwarePaginator $page): array
    {
        return ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
            'total' => $page->total(), 'per_page' => $page->perPage()];
    }
}
