<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('erp_journal_lines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('journal_id');
            $table->unsignedBigInteger('account_id');
            $table->unsignedInteger('position');
            $table->unsignedBigInteger('debit_minor');
            $table->unsignedBigInteger('credit_minor');
            $table->timestamps();
            $table->softDeletes();
            $table->foreign(['organization_id', 'journal_id'], 'erp_lines_journal_fk')
                ->references(['organization_id', 'id'])->on('erp_journals');
            $table->foreign(['organization_id', 'account_id'], 'erp_lines_account_fk')
                ->references(['organization_id', 'id'])->on('erp_accounts');
            $table->index(['organization_id', 'account_id', 'id'], 'erp_lines_org_account_id');
        });
        DB::statement('CREATE UNIQUE INDEX erp_lines_org_journal_position ON erp_journal_lines (organization_id, journal_id, position) WHERE deleted_at IS NULL');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE erp_journal_lines ADD CONSTRAINT erp_lines_one_side CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))');
        }
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS erp_lines_org_journal_position');
        Schema::dropIfExists('erp_journal_lines');
    }
};
