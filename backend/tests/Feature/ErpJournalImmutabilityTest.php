<?php

namespace Tests\Feature;

use App\Modules\Erp\AuthorizedErpScope;
use App\Modules\Erp\ErpActions;
use App\Modules\Erp\Models\Account;
use App\Modules\Erp\Models\Journal;
use App\Modules\Erp\Models\JournalLine;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

class ErpJournalImmutabilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/erp', '--force' => true]);
    }

    private function action(string $action, array $input, ?int $id = null): array
    {
        $message = ['id' => 'e37a3e1e-62df-4b13-bbbf-fc0963f5c189', 'source' => 'platform',
            'destination' => 'erp', 'topic' => 'erp.command', 'version' => 1,
            'payload' => ['scope' => ['platform_user_id' => 11, 'organization_id' => 7,
                'application' => 'erp', 'action' => $action, 'auth_version' => 0, 'token_id' => 43],
                'command' => ['input' => $input, 'operation_id' => '3b630bea-44aa-4567-91c7-d61d70161802']]];
        $scope = AuthorizedErpScope::fromVerifiedExchange($message, fn (): bool => true);

        return app(ErpActions::class)->execute($scope, $input, $id);
    }

    private function draft(): array
    {
        $cash = Account::factory()->create(['organization_id' => 7, 'code' => 'cash']);
        $sales = Account::factory()->create(['organization_id' => 7, 'code' => 'sales', 'type' => Account::Revenue]);
        $journal = $this->action('erp.journals.create', ['effective_date' => gmdate('Y-m-d'),
            'description' => 'Balanced', 'currency' => 'USD', 'lines' => [
                ['account_id' => $cash->id, 'debit_minor' => 100, 'credit_minor' => 0],
                ['account_id' => $sales->id, 'debit_minor' => 0, 'credit_minor' => 100],
            ]])['journal'];

        return [$journal, $cash, $sales];
    }

    private function rejectsSql(callable $write): void
    {
        try {
            DB::transaction($write);
            $this->fail('Posted journal accepted a raw database mutation.');
        } catch (QueryException $error) {
            $this->assertStringContainsString('Posted journal', $error->getMessage());
        }
    }

    public function test_raw_writes_cannot_change_posted_header_or_lines(): void
    {
        [$draft, $cash] = $this->draft();
        $posted = $this->action('erp.journals.post', ['expected_version' => 0], $draft['id'])['journal'];
        $lineId = $posted['lines'][0]['id'];

        $this->rejectsSql(fn () => DB::table('erp_journals')->where('id', $draft['id'])->update(['description' => 'Forged']));
        $this->rejectsSql(fn () => DB::table('erp_journals')->where('id', $draft['id'])->update(['deleted_at' => now()]));
        $this->rejectsSql(fn () => DB::table('erp_journals')->where('id', $draft['id'])->delete());
        $this->rejectsSql(fn () => DB::table('erp_journal_lines')->where('id', $lineId)->update(['debit_minor' => 200]));
        $this->rejectsSql(fn () => DB::table('erp_journal_lines')->where('id', $lineId)->update(['deleted_at' => now()]));
        $this->rejectsSql(fn () => DB::table('erp_journal_lines')->where('id', $lineId)->delete());
        $this->rejectsSql(fn () => DB::table('erp_journal_lines')->insert([
            'organization_id' => 7, 'journal_id' => $draft['id'], 'account_id' => $cash->id,
            'position' => 3, 'debit_minor' => 1, 'credit_minor' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ]));
        $otherDraft = Journal::factory()->create(['organization_id' => 7]);
        $otherLine = JournalLine::factory()->create(['organization_id' => 7,
            'journal_id' => $otherDraft->id, 'account_id' => $cash->id, 'position' => 3]);
        $this->rejectsSql(fn () => DB::table('erp_journal_lines')->where('id', $otherLine->id)
            ->update(['journal_id' => $draft['id']]));
        $this->rejectsSql(fn () => DB::table('erp_journals')->insert([
            'organization_id' => 7, 'created_by_platform_user_id' => 11,
            'updated_by_platform_user_id' => 11, 'effective_date' => gmdate('Y-m-d'),
            'description' => 'Direct posted', 'currency' => 'USD', 'status' => Journal::Posted,
            'total_minor' => 100, 'created_at' => now(), 'updated_at' => now(),
        ]));

        $this->assertSame($posted, $this->action('erp.journals.detail', [], $draft['id'])['journal']);
        $this->assertSame(2, DB::table('erp_journal_lines')->where('journal_id', $draft['id'])->count());
    }

    public function test_draft_edits_posting_and_reversal_still_work(): void
    {
        [$draft, $cash, $sales] = $this->draft();
        $edited = $this->action('erp.journals.update', [
            'expected_version' => 0, 'effective_date' => gmdate('Y-m-d'),
            'description' => 'Revised', 'currency' => 'USD', 'lines' => [
                ['account_id' => $cash->id, 'debit_minor' => 250, 'credit_minor' => 0],
                ['account_id' => $sales->id, 'debit_minor' => 0, 'credit_minor' => 250],
            ]], $draft['id'])['journal'];
        $this->assertSame(Journal::Draft, $edited['status']);
        $this->assertSame(250, $edited['total_minor']);
        $posted = $this->action('erp.journals.post', ['expected_version' => 1], $draft['id'])['journal'];
        $reversal = $this->action('erp.journals.reverse', [
            'expected_version' => 2, 'effective_date' => gmdate('Y-m-d'),
        ], $draft['id'])['journal'];
        $this->assertSame(Journal::Posted, $reversal['status']);
        $this->assertSame(1, $reversal['version']);
        $this->assertSame($draft['id'], $reversal['reverses_journal_id']);
        $this->assertSame($posted['lines'][0]['debit_minor'], $reversal['lines'][0]['credit_minor']);
        $this->assertSame($posted['lines'][1]['credit_minor'], $reversal['lines'][1]['debit_minor']);
        $this->assertSame($posted, $this->action('erp.journals.detail', [], $draft['id'])['journal']);
    }

    #[Group('postgresql')]
    public function test_postgresql_rejects_truncate_bypasses(): void
    {
        $this->assertSame('pgsql', DB::getDriverName());
        [$draft] = $this->draft();
        $this->action('erp.journals.post', ['expected_version' => 0], $draft['id']);
        $this->rejectsSql(fn () => DB::statement('TRUNCATE erp_journal_lines'));
        $this->rejectsSql(fn () => DB::statement('TRUNCATE erp_journals CASCADE'));
        $this->assertSame(2, DB::table('erp_journal_lines')->where('journal_id', $draft['id'])->count());
    }

    #[Group('postgresql')]
    public function test_postgresql_guard_migration_rebuilds_with_surviving_functions(): void
    {
        $this->assertSame('pgsql', DB::getDriverName());
        $migration = require database_path('migrations/services/erp/2026_10_13_050003_guard_posted_journals.php');
        $migration->down();
        $this->assertNull(DB::selectOne("SELECT to_regprocedure('erp_guard_journal()') AS name")->name);
        $this->assertNull(DB::selectOne("SELECT to_regprocedure('erp_guard_journal_line()') AS name")->name);
        $migration->up();

        foreach ([
            'erp_journal_immutable' => 'erp_journals',
            'erp_journal_no_truncate' => 'erp_journals',
            'erp_journal_line_immutable' => 'erp_journal_lines',
            'erp_journal_line_no_truncate' => 'erp_journal_lines',
        ] as $trigger => $table) {
            DB::statement("DROP TRIGGER {$trigger} ON {$table}");
        }
        $this->assertNotNull(DB::selectOne("SELECT to_regprocedure('erp_guard_journal()') AS name")->name);
        $this->assertNotNull(DB::selectOne("SELECT to_regprocedure('erp_guard_journal_line()') AS name")->name);
        $migration->up();

        [$draft] = $this->draft();
        $this->action('erp.journals.post', ['expected_version' => 0], $draft['id']);
        $this->rejectsSql(fn () => DB::table('erp_journals')->where('id', $draft['id'])
            ->update(['description' => 'Forged after rebuild']));
        $this->rejectsSql(fn () => DB::table('erp_journal_lines')->where('journal_id', $draft['id'])
            ->delete());
    }
}
