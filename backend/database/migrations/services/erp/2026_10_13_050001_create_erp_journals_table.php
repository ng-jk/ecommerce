<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('erp_journals', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->unsignedBigInteger('updated_by_platform_user_id');
            $table->date('effective_date');
            $table->string('description', 500);
            $table->string('currency', 3);
            $table->string('status', 16)->default('draft');
            $table->unsignedBigInteger('version')->default(0);
            $table->unsignedBigInteger('total_minor');
            $table->timestamp('posted_at')->nullable();
            $table->unsignedBigInteger('reverses_journal_id')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->unique('reverses_journal_id');
            $table->foreign(['organization_id', 'reverses_journal_id'], 'erp_journals_reversal_fk')
                ->references(['organization_id', 'id'])->on('erp_journals');
            $table->index(['organization_id', 'status', 'effective_date', 'id'], 'erp_journals_org_status_date_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('erp_journals');
    }
};
