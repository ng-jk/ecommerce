<?php

namespace Tests\Feature;

use App\Modules\Erp\AuthorizedErpScope;
use App\Modules\Erp\ErpActions;
use App\Modules\Erp\Models\Account;
use App\Modules\Erp\Models\Journal;
use App\Modules\Erp\Models\JournalLine;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;
use PDOException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class ErpActionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/erp', '--force' => true]);
    }

    private function scope(string $action, array $input = [], int $organizationId = 7): AuthorizedErpScope
    {
        $envelope = ['id' => 'e37a3e1e-62df-4b13-bbbf-fc0963f5c189', 'source' => 'platform',
            'destination' => 'erp', 'topic' => 'erp.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 11, 'organization_id' => $organizationId,
                'application' => 'erp', 'action' => $action, 'auth_version' => 0, 'token_id' => 43],
                'command' => ['input' => $input, 'operation_id' => '3b630bea-44aa-4567-91c7-d61d70161802']]];

        return AuthorizedErpScope::fromVerifiedExchange($envelope, fn () => true);
    }

    private function runAction(string $action, array $input = [], ?int $id = null, int $org = 7): array
    {
        return DB::transaction(fn (): array => app(ErpActions::class)->execute($this->scope($action, $input, $org), $input, $id));
    }

    private function account(string $code, string $type = Account::Asset, int $org = 7): array
    {
        return $this->runAction('erp.accounts.create', ['code' => $code, 'name' => ucfirst($code), 'type' => $type], null, $org)['account'];
    }

    private function journal(int $debitAccount, int $creditAccount, ?string $date = null, int $org = 7): array
    {
        return $this->runAction('erp.journals.create', ['effective_date' => $date ?? gmdate('Y-m-d'),
            'description' => 'Initial journal', 'currency' => 'USD', 'lines' => [
                ['account_id' => $debitAccount, 'debit_minor' => 1250, 'credit_minor' => 0],
                ['account_id' => $creditAccount, 'debit_minor' => 0, 'credit_minor' => 1250],
            ]], null, $org)['journal'];
    }

    private function invalid(string $field, callable $run): void
    {
        try {
            $run();
            $this->fail('Invalid command accepted.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey($field, $error->errors());
        }
    }

    private function conflict(callable $run): void
    {
        try {
            $run();
            $this->fail('Conflicting command accepted.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
    }

    public function test_chart_of_accounts_is_org_scoped_indexed_paginated_and_versioned(): void
    {
        $cash = $this->account('cash');
        $sales = $this->account('sales', Account::Revenue);
        $this->account('cash', Account::Asset, 8);
        $this->assertSame([$cash], $this->runAction('erp.accounts.list', ['type' => Account::Asset, 'per_page' => 1])['data']);
        $this->assertSame([$sales], $this->runAction('erp.accounts.list', ['page' => 2, 'per_page' => 1])['data']);
        $this->assertSame([$sales], $this->runAction('erp.accounts.list', ['page' => '2', 'per_page' => '1'])['data']);
        $this->assertSame(Account::options(), $this->runAction('erp.accounts.detail', [], $cash['id'])['options']['type']);
        $renamed = $this->runAction('erp.accounts.update', ['name' => 'Cash on hand',
            'expected_version' => 0], $cash['id'])['account'];
        $this->assertSame(1, $renamed['version']);
        $this->assertSame('cash', $renamed['code']);
        $this->conflict(fn () => $this->runAction('erp.accounts.update', ['name' => 'Old', 'expected_version' => 0], $cash['id']));
        $this->invalid('code', fn () => $this->account('cash'));
        $this->invalid('code', fn () => $this->account('INVALID!'));
        $this->invalid('type', fn () => $this->account('other', 'mystery'));
        $this->invalid('per_page', fn () => $this->runAction('erp.accounts.list', ['per_page' => 51]));
        $this->invalid('created_by_platform_user_id', fn () => $this->runAction('erp.accounts.create', [
            'code' => 'forged', 'name' => 'Forged', 'type' => Account::Asset, 'created_by_platform_user_id' => 999]));
        $this->expectException(ModelNotFoundException::class);
        $this->runAction('erp.accounts.detail', [], $cash['id'], 8);
    }

    public function test_balanced_journal_posting_is_immutable_and_ledger_excludes_drafts(): void
    {
        $cash = $this->account('cash');
        $sales = $this->account('sales', Account::Revenue);
        $draft = $this->journal($cash['id'], $sales['id']);
        $this->assertSame(1250, $draft['total_minor']);
        $this->assertSame(Journal::Draft, $draft['status']);
        $this->assertSame([], $this->runAction('erp.ledger.list', ['account_id' => $cash['id']])['data']);
        $this->assertSame($draft, $this->runAction('erp.journals.detail', [], $draft['id'])['journal']);
        $this->assertSame([$draft['id']], array_column($this->runAction('erp.journals.list', ['status' => 'draft'])['data'], 'id'));
        $this->invalid('lines', fn () => $this->runAction('erp.journals.create', [
            'effective_date' => gmdate('Y-m-d'), 'description' => 'Unbalanced', 'currency' => 'USD', 'lines' => [
                ['account_id' => $cash['id'], 'debit_minor' => 100, 'credit_minor' => 0],
                ['account_id' => $sales['id'], 'debit_minor' => 0, 'credit_minor' => 99]]]));
        $this->conflict(fn () => $this->runAction('erp.journals.post', ['expected_version' => 1], $draft['id']));
        $posted = $this->runAction('erp.journals.post', ['expected_version' => 0], $draft['id'])['journal'];
        $this->assertSame(Journal::Posted, $posted['status']);
        $this->assertSame(1, $posted['version']);
        $this->assertNotNull($posted['posted_at']);
        $ledger = $this->runAction('erp.ledger.list', ['account_id' => $cash['id'], 'per_page' => 1]);
        $this->assertSame(1, $ledger['meta']['total']);
        $this->assertSame(1250, $ledger['data'][0]['debit_minor']);
        $this->assertSame(1, $this->runAction('erp.ledger.list', ['account_id' => (string) $cash['id'],
            'page' => '1', 'per_page' => '1'])['meta']['total']);
        $this->assertArrayNotHasKey('organization_id', $ledger['data'][0]);
        $this->conflict(fn () => $this->runAction('erp.journals.update', [
            'effective_date' => gmdate('Y-m-d'), 'description' => 'Altered', 'currency' => 'USD',
            'lines' => [['account_id' => $cash['id'], 'debit_minor' => 100, 'credit_minor' => 0],
                ['account_id' => $sales['id'], 'debit_minor' => 0, 'credit_minor' => 100]],
            'expected_version' => 1], $draft['id']));
        $this->conflict(fn () => $this->runAction('erp.journals.post', ['expected_version' => 1], $draft['id']));
        $this->assertSame(2, JournalLine::query()->where('journal_id', $draft['id'])->count());
    }

    public function test_draft_replacement_and_reversal_create_equal_opposite_posted_lines_once(): void
    {
        $cash = $this->account('cash');
        $sales = $this->account('sales', Account::Revenue);
        $draft = $this->journal($cash['id'], $sales['id']);
        $changed = $this->runAction('erp.journals.update', ['effective_date' => gmdate('Y-m-d'),
            'description' => 'Revised', 'currency' => 'MYR', 'lines' => [
                ['account_id' => $cash['id'], 'debit_minor' => 500, 'credit_minor' => 0],
                ['account_id' => $sales['id'], 'debit_minor' => 0, 'credit_minor' => 500]],
            'expected_version' => 0], $draft['id'])['journal'];
        $this->assertSame(1, $changed['version']);
        $this->assertSame(500, $changed['total_minor']);
        $this->assertSame(2, JournalLine::onlyTrashed()->where('journal_id', $draft['id'])->count());
        $posted = $this->runAction('erp.journals.post', ['expected_version' => 1], $draft['id'])['journal'];
        $reversal = $this->runAction('erp.journals.reverse', ['effective_date' => gmdate('Y-m-d'),
            'expected_version' => 2], $draft['id'])['journal'];
        $this->assertSame(Journal::Posted, $reversal['status']);
        $this->assertSame($draft['id'], $reversal['reverses_journal_id']);
        $this->assertSame($posted['currency'], $reversal['currency']);
        $this->assertSame($posted['lines'][0]['debit_minor'], $reversal['lines'][0]['credit_minor']);
        $this->assertSame($posted['lines'][1]['credit_minor'], $reversal['lines'][1]['debit_minor']);
        $this->assertSame($posted, $this->runAction('erp.journals.detail', [], $draft['id'])['journal']);
        $this->conflict(fn () => $this->runAction('erp.journals.reverse', ['effective_date' => gmdate('Y-m-d'),
            'expected_version' => 2], $draft['id']));
        $this->conflict(fn () => $this->runAction('erp.journals.reverse', ['effective_date' => gmdate('Y-m-d'),
            'expected_version' => 1], $reversal['id']));
        $this->assertSame(2, $this->runAction('erp.ledger.list', ['account_id' => $cash['id']])['meta']['total']);
    }

    public function test_future_drafts_invalid_calendar_amounts_and_foreign_accounts_fail_closed(): void
    {
        $cash = $this->account('cash');
        $sales = $this->account('sales', Account::Revenue);
        $foreign = $this->account('foreign', Account::Asset, 8);
        $future = gmdate('Y-m-d', time() + 86400 * 3);
        $draft = $this->journal($cash['id'], $sales['id'], $future);
        $this->conflict(fn () => $this->runAction('erp.journals.post', ['expected_version' => 0], $draft['id']));
        $this->invalid('effective_date', fn () => $this->journal($cash['id'], $sales['id'], '2026-02-30'));
        try {
            $this->journal($cash['id'], $foreign['id']);
            $this->fail('Foreign account accepted.');
        } catch (HttpException $error) {
            $this->assertSame(404, $error->getStatusCode());
        }
        $this->invalid('lines', fn () => $this->runAction('erp.journals.create', [
            'effective_date' => gmdate('Y-m-d'), 'description' => 'Both sides', 'currency' => 'USD',
            'lines' => [['account_id' => $cash['id'], 'debit_minor' => 100, 'credit_minor' => 100],
                ['account_id' => $sales['id'], 'debit_minor' => 0, 'credit_minor' => 100]]]));
        $this->invalid('lines', fn () => $this->runAction('erp.journals.create', [
            'effective_date' => gmdate('Y-m-d'), 'description' => 'Too large', 'currency' => 'USD',
            'lines' => [['account_id' => $cash['id'], 'debit_minor' => 9000000000000000, 'credit_minor' => 0],
                ['account_id' => $cash['id'], 'debit_minor' => 1, 'credit_minor' => 0],
                ['account_id' => $sales['id'], 'debit_minor' => 0, 'credit_minor' => 9000000000000000]]]));
        $this->invalid('currency', fn () => $this->runAction('erp.journals.create', [
            'effective_date' => gmdate('Y-m-d'), 'description' => 'Invalid', 'currency' => 'usd',
            'lines' => [['account_id' => $cash['id'], 'debit_minor' => 1, 'credit_minor' => 0],
                ['account_id' => $sales['id'], 'debit_minor' => 0, 'credit_minor' => 1]]]));
        $this->invalid('account_id', fn () => $this->runAction('erp.ledger.list', []));
        foreach (['0', '01', '1e1', '999999999999999999999999999999'] as $bad) {
            $this->invalid('account_id', fn () => $this->runAction('erp.ledger.list', ['account_id' => $bad]));
        }
    }

    public function test_post_rechecks_corrupt_line_set_and_scope_rejects_non_boolean_authority(): void
    {
        $cash = $this->account('cash');
        $sales = $this->account('sales', Account::Revenue);
        $draft = $this->journal($cash['id'], $sales['id']);
        JournalLine::query()->where('journal_id', $draft['id'])->where('position', 2)->delete();
        $this->invalid('lines', fn () => $this->runAction('erp.journals.post', ['expected_version' => 0], $draft['id']));
        $message = ['id' => 'e37a3e1e-62df-4b13-bbbf-fc0963f5c189', 'source' => 'platform',
            'destination' => 'erp', 'topic' => 'erp.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 11, 'organization_id' => 7,
                'application' => 'erp', 'action' => 'erp.ledger.list', 'auth_version' => 0, 'token_id' => 43],
                'command' => ['input' => [], 'operation_id' => '3b630bea-44aa-4567-91c7-d61d70161802']]];
        $this->assertNull(AuthorizedErpScope::fromVerifiedExchange($message, fn () => false));
        try {
            AuthorizedErpScope::fromVerifiedExchange($message, fn () => null);
            $this->fail('Non-boolean authorization accepted.');
        } catch (LogicException $error) {
            $this->assertSame('Service authorization must return a boolean.', $error->getMessage());
        }
        $message['payload']['scope']['application'] = 'builder';
        $this->invalid('message.payload.scope.application',
            fn () => AuthorizedErpScope::fromVerifiedExchange($message, fn () => true));
    }

    public function test_factories_and_non_unique_database_error_guard(): void
    {
        $account = Account::factory()->create(['organization_id' => 7, 'code' => 'factory-cash']);
        $journal = Journal::factory()->create(['organization_id' => 7]);
        $line = JournalLine::factory()->create(['organization_id' => 7,
            'journal_id' => $journal->id, 'account_id' => $account->id]);
        $this->assertSame(1, $line->position);
        $this->assertSame('factory-cash', $account->code);
        Account::creating(function (): void {
            throw new QueryException('sqlite', 'insert', [], new PDOException('storage unavailable'));
        });
        $this->expectException(QueryException::class);
        $this->account('unavailable');
    }
}
