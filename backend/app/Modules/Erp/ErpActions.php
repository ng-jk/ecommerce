<?php

namespace App\Modules\Erp;

use App\Modules\Erp\Models\Account;
use App\Modules\Erp\Models\Journal;
use App\Modules\Erp\Models\JournalLine;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class ErpActions
{
    private const MaxMinor = 9000000000000000;

    public function authorizeResult(AuthorizedErpScope $scope, array $command, array $result): bool
    {
        // Ledger and journal visibility is organization-wide under the current
        // centrally verified role; there are no separate local access grants.
        return in_array($scope->action, AuthorizedErpScope::Actions, true);
    }

    public function execute(AuthorizedErpScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null && $id < 1, 404);

        return match ($scope->action) {
            'erp.accounts.list' => $this->accounts($scope, $input, $id),
            'erp.accounts.create' => $this->createAccount($scope, $input, $id),
            'erp.accounts.detail' => $this->account($scope, $input, $this->id($id)),
            'erp.accounts.update' => $this->updateAccount($scope, $input, $this->id($id)),
            'erp.journals.list' => $this->journals($scope, $input, $id),
            'erp.journals.create' => $this->createJournal($scope, $input, $id),
            'erp.journals.detail' => $this->journal($scope, $input, $this->id($id)),
            'erp.journals.update' => $this->updateJournal($scope, $input, $this->id($id)),
            'erp.journals.post' => $this->post($scope, $input, $this->id($id)),
            'erp.journals.reverse' => $this->reverse($scope, $input, $this->id($id)),
            'erp.ledger.list' => $this->ledger($scope, $input, $id),
            default => abort(403, 'ERP action is unavailable.'),
        };
    }

    private function accounts(AuthorizedErpScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null, 422);
        $data = $this->validated($input, $this->pageRules() + ['type' => ['sometimes', Rule::in(array_keys(Account::options()))]], true);
        $query = Account::query()->where('organization_id', $scope->organizationId);
        if (isset($data['type'])) {
            $query->where('type', $data['type']);
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20), ['*'], 'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (Account $row): array => $this->publicAccount($row))->all(),
            'meta' => [...$this->meta($page), 'options' => ['type' => Account::options()]]];
    }

    private function createAccount(AuthorizedErpScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null, 422);
        $data = $this->validated($input, ['code' => ['required', 'string', 'min:2', 'max:40', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'name' => 'required|string|min:1|max:200', 'type' => ['required', Rule::in(array_keys(Account::options()))]]);
        try {
            $row = DB::transaction(fn (): Account => Account::create(['organization_id' => $scope->organizationId,
                'created_by_platform_user_id' => $scope->platformUserId, 'updated_by_platform_user_id' => $scope->platformUserId,
                'code' => strtolower($data['code']), 'name' => trim($data['name']), 'type' => $data['type']]));
        } catch (QueryException $error) {
            $this->uniqueOrThrow($error, 'code');
        }

        return ['account' => $this->publicAccount($row), 'options' => ['type' => Account::options()]];
    }

    private function account(AuthorizedErpScope $scope, array $input, int $id): array
    {
        $this->validated($input, []);

        return ['account' => $this->publicAccount($this->accountRow($scope, $id)),
            'options' => ['type' => Account::options()]];
    }

    private function updateAccount(AuthorizedErpScope $scope, array $input, int $id): array
    {
        $data = $this->validated($input, ['name' => 'required|string|min:1|max:200',
            'expected_version' => 'required|integer:strict|min:0']);
        $row = $this->accountRow($scope, $id, true);
        $this->version($row->version, $data['expected_version']);
        $row->update(['name' => trim($data['name']), 'version' => $row->version + 1,
            'updated_by_platform_user_id' => $scope->platformUserId]);

        return ['account' => $this->publicAccount($row), 'options' => ['type' => Account::options()]];
    }

    private function journals(AuthorizedErpScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null, 422);
        $data = $this->validated($input, $this->pageRules() + ['status' => ['sometimes', Rule::in(array_keys(Journal::options()))]], true);
        $query = Journal::query()->where('organization_id', $scope->organizationId);
        if (isset($data['status'])) {
            $query->where('status', $data['status'])->orderBy('effective_date');
        }
        $page = $query->orderBy('id')->paginate((int) ($data['per_page'] ?? 20), ['*'], 'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (Journal $row): array => $this->publicJournal($row, false))->all(),
            'meta' => [...$this->meta($page), 'options' => ['status' => Journal::options()]]];
    }

    private function createJournal(AuthorizedErpScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null, 422);
        $data = $this->journalInput($input);
        $row = DB::transaction(function () use ($scope, $data): Journal {
            $this->checkAccounts($scope, $data['lines']);
            $journal = Journal::create(['organization_id' => $scope->organizationId,
                'created_by_platform_user_id' => $scope->platformUserId, 'updated_by_platform_user_id' => $scope->platformUserId,
                'effective_date' => $data['effective_date'], 'description' => trim($data['description']),
                'currency' => $data['currency'], 'total_minor' => $data['total_minor']]);
            $this->insertLines($scope, $journal, $data['lines']);

            return $journal;
        });

        return ['journal' => $this->publicJournal($row, true), 'options' => ['status' => Journal::options()]];
    }

    private function journal(AuthorizedErpScope $scope, array $input, int $id): array
    {
        $this->validated($input, []);

        return ['journal' => $this->publicJournal($this->journalRow($scope, $id), true),
            'options' => ['status' => Journal::options()]];
    }

    private function updateJournal(AuthorizedErpScope $scope, array $input, int $id): array
    {
        $data = $this->journalInput($input, true);
        $row = DB::transaction(function () use ($scope, $id, $data): Journal {
            $journal = $this->journalRow($scope, $id, true);
            $this->version($journal->version, $data['expected_version']);
            abort_if($journal->status !== Journal::Draft, 409, 'Posted journals are immutable.');
            $this->checkAccounts($scope, $data['lines']);
            $journal->lines()->delete();
            $this->insertLines($scope, $journal, $data['lines']);
            $journal->update(['effective_date' => $data['effective_date'], 'description' => trim($data['description']),
                'currency' => $data['currency'], 'total_minor' => $data['total_minor'],
                'version' => $journal->version + 1, 'updated_by_platform_user_id' => $scope->platformUserId]);

            return $journal;
        });

        return ['journal' => $this->publicJournal($row, true), 'options' => ['status' => Journal::options()]];
    }

    private function post(AuthorizedErpScope $scope, array $input, int $id): array
    {
        $data = $this->validated($input, ['expected_version' => 'required|integer:strict|min:0']);
        $row = DB::transaction(function () use ($scope, $id, $data): Journal {
            $journal = $this->journalRow($scope, $id, true);
            $this->version($journal->version, $data['expected_version']);
            abort_if($journal->status !== Journal::Draft || $journal->reverses_journal_id !== null,
                409, 'Only drafts may be posted.');
            abort_if($journal->effective_date->toDateString() > Carbon::now('UTC')->toDateString(),
                409, 'Future dated drafts cannot be posted.');
            $lines = $journal->lines()->get()->map(fn (JournalLine $line): array => [
                'account_id' => $line->account_id, 'debit_minor' => $line->debit_minor,
                'credit_minor' => $line->credit_minor])->all();
            $this->checkAccounts($scope, $lines);
            $this->balance($lines);
            $journal->update(['status' => Journal::Posted, 'posted_at' => now(),
                'version' => $journal->version + 1, 'updated_by_platform_user_id' => $scope->platformUserId]);

            return $journal;
        });

        return ['journal' => $this->publicJournal($row, true), 'options' => ['status' => Journal::options()]];
    }

    private function reverse(AuthorizedErpScope $scope, array $input, int $id): array
    {
        $data = $this->validated($input, ['expected_version' => 'required|integer:strict|min:0',
            'effective_date' => 'required|date_format:Y-m-d']);
        $row = DB::transaction(function () use ($scope, $id, $data): Journal {
            $original = $this->journalRow($scope, $id, true);
            $this->version($original->version, $data['expected_version']);
            abort_if($original->status !== Journal::Posted || $original->reverses_journal_id !== null,
                409, 'Only original posted journals may be reversed.');
            abort_if(Journal::query()->where('organization_id', $scope->organizationId)
                ->where('reverses_journal_id', $original->id)->exists(), 409, 'Journal is already reversed.');
            abort_if($data['effective_date'] < $original->effective_date->toDateString() ||
                $data['effective_date'] > Carbon::now('UTC')->toDateString(), 409, 'Reversal date is unavailable.');
            $lines = $original->lines()->get()->map(fn (JournalLine $line): array => [
                'account_id' => $line->account_id, 'debit_minor' => $line->credit_minor,
                'credit_minor' => $line->debit_minor])->all();
            $this->checkAccounts($scope, $lines);
            $this->balance($lines);
            $reversal = Journal::create(['organization_id' => $scope->organizationId,
                'created_by_platform_user_id' => $scope->platformUserId, 'updated_by_platform_user_id' => $scope->platformUserId,
                'effective_date' => $data['effective_date'], 'description' => 'Reversal of journal '.$original->id,
                'currency' => $original->currency, 'status' => Journal::Posted, 'version' => 1,
                'total_minor' => $original->total_minor, 'posted_at' => now(),
                'reverses_journal_id' => $original->id]);
            $this->insertLines($scope, $reversal, $lines);

            return $reversal;
        });

        return ['journal' => $this->publicJournal($row, true), 'options' => ['status' => Journal::options()]];
    }

    private function ledger(AuthorizedErpScope $scope, array $input, ?int $id): array
    {
        abort_if($id !== null, 422);
        $data = $this->validated($input, $this->pageRules() + ['account_id' => 'required|integer:strict|min:1'], true);
        $this->accountRow($scope, $data['account_id']);
        $page = JournalLine::query()->where('organization_id', $scope->organizationId)
            ->where('account_id', $data['account_id'])
            ->whereHas('journal', fn ($query) => $query->where('organization_id', $scope->organizationId)
                ->where('status', Journal::Posted))
            ->orderBy('id')->paginate((int) ($data['per_page'] ?? 20), ['*'], 'page', (int) ($data['page'] ?? 1));

        return ['data' => $page->getCollection()->map(fn (JournalLine $line): array => [
            'id' => $line->id, 'journal_id' => $line->journal_id, 'account_id' => $line->account_id,
            'debit_minor' => $line->debit_minor, 'credit_minor' => $line->credit_minor])->all(),
            'meta' => $this->meta($page)];
    }

    private function journalInput(array $input, bool $update = false): array
    {
        $rules = ['effective_date' => 'required|date_format:Y-m-d',
            'description' => 'required|string|min:1|max:500', 'currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'lines' => 'required|array|min:2|max:100', 'lines.*' => 'required|array:account_id,debit_minor,credit_minor',
            'lines.*.account_id' => 'required|integer:strict|min:1',
            'lines.*.debit_minor' => 'required|integer:strict|min:0|max:'.self::MaxMinor,
            'lines.*.credit_minor' => 'required|integer:strict|min:0|max:'.self::MaxMinor];
        if ($update) {
            $rules['expected_version'] = 'required|integer:strict|min:0';
        }
        $data = $this->validated($input, $rules);
        $data['total_minor'] = $this->balance($data['lines']);

        return $data;
    }

    private function balance(array $lines): int
    {
        if (count($lines) < 2 || count($lines) > 100) {
            throw ValidationException::withMessages(['lines' => 'Provide between 2 and 100 journal lines.']);
        }
        $debit = 0;
        $credit = 0;
        foreach ($lines as $line) {
            if (($line['debit_minor'] > 0) === ($line['credit_minor'] > 0)) {
                throw ValidationException::withMessages(['lines' => 'Each line needs exactly one positive side.']);
            }
            $debit += $line['debit_minor'];
            $credit += $line['credit_minor'];
            if ($debit > self::MaxMinor || $credit > self::MaxMinor) {
                throw ValidationException::withMessages(['lines' => 'Journal total exceeds the supported minor-unit range.']);
            }
        }
        if ($debit === 0 || $debit !== $credit) {
            throw ValidationException::withMessages(['lines' => 'Journal debits and credits must balance.']);
        }

        return $debit;
    }

    private function checkAccounts(AuthorizedErpScope $scope, array $lines): void
    {
        $ids = array_values(array_unique(array_map(fn (array $line): int => $line['account_id'], $lines)));
        sort($ids, SORT_NUMERIC);
        $accounts = Account::query()->where('organization_id', $scope->organizationId)
            ->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get(['id']);
        abort_if($accounts->count() !== count($ids), 404);
    }

    private function insertLines(AuthorizedErpScope $scope, Journal $journal, array $lines): void
    {
        foreach ($lines as $position => $line) {
            JournalLine::create(['organization_id' => $scope->organizationId, 'journal_id' => $journal->id,
                'account_id' => $line['account_id'], 'position' => $position + 1,
                'debit_minor' => $line['debit_minor'], 'credit_minor' => $line['credit_minor']]);
        }
    }

    private function accountRow(AuthorizedErpScope $scope, int $id, bool $lock = false): Account
    {
        $query = Account::query()->where('organization_id', $scope->organizationId)->whereKey($id);

        return ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
    }

    private function journalRow(AuthorizedErpScope $scope, int $id, bool $lock = false): Journal
    {
        $query = Journal::query()->where('organization_id', $scope->organizationId)->whereKey($id);

        return ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
    }

    private function id(?int $id): int
    {
        abort_if($id === null, 404);

        return $id;
    }

    private function version(int $version, int $expected): void
    {
        abort_if($version !== $expected, 409, 'ERP record version changed.');
    }

    private function validated(array $input, array $rules, bool $query = false): array
    {
        $top = array_filter(array_keys($rules), fn (string $key): bool => ! str_contains($key, '.'));
        $unknown = array_diff(array_keys($input), $top);
        if ($unknown !== []) {
            throw ValidationException::withMessages([array_values($unknown)[0] => 'Field is not accepted.']);
        }
        if ($query) {
            foreach (['page', 'per_page', 'account_id'] as $field) {
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

    private function pageRules(): array
    {
        return ['page' => 'sometimes|integer:strict|min:1|max:1000000', 'per_page' => 'sometimes|integer:strict|min:1|max:50'];
    }

    private function publicAccount(Account $row): array
    {
        return ['id' => $row->id, 'code' => $row->code, 'name' => $row->name,
            'type' => $row->type, 'version' => $row->version];
    }

    private function publicJournal(Journal $row, bool $lines): array
    {
        $result = ['id' => $row->id, 'effective_date' => $row->effective_date->toDateString(),
            'description' => $row->description, 'currency' => $row->currency, 'status' => $row->status,
            'version' => $row->version, 'total_minor' => $row->total_minor,
            'posted_at' => $row->posted_at?->toISOString(), 'reverses_journal_id' => $row->reverses_journal_id];
        if ($lines) {
            $result['lines'] = $row->lines()->get()->map(fn (JournalLine $line): array => [
                'id' => $line->id, 'position' => $line->position, 'account_id' => $line->account_id,
                'debit_minor' => $line->debit_minor, 'credit_minor' => $line->credit_minor])->all();
        }

        return $result;
    }

    private function meta(LengthAwarePaginator $page): array
    {
        return ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(),
            'last_page' => $page->lastPage(), 'total' => $page->total()];
    }

    private function uniqueOrThrow(QueryException $error, string $field): never
    {
        if (in_array((string) $error->getCode(), ['23000', '23505'], true)) {
            throw ValidationException::withMessages([$field => 'Code is already in use.']);
        }

        throw $error;
    }
}
