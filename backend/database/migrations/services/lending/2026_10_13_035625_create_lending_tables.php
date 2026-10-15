<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lending_products', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('code', 60);
            $table->string('name', 200);
            $table->string('jurisdiction_label', 120);
            $table->text('terms_text');
            $table->string('currency', 3);
            $table->unsignedTinyInteger('minor_unit_digits');
            $table->unsignedBigInteger('principal_min_minor');
            $table->unsignedBigInteger('principal_max_minor');
            $table->unsignedInteger('term_rate_numerator');
            $table->unsignedInteger('term_rate_denominator');
            $table->unsignedSmallInteger('installment_count');
            $table->unsignedSmallInteger('interval_days');
            $table->enum('status', ['draft', 'active', 'disabled'])->default('draft');
            $table->unsignedInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'code']);
            $table->index(['organization_id', 'status', 'id']);
            $table->index(['organization_id', 'id']);
        });
        Schema::create('lending_applications', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('applicant_platform_user_id');
            $table->foreignId('product_id')->constrained('lending_products');
            $table->unsignedBigInteger('principal_minor');
            $table->date('first_due_date');
            $table->text('purpose');
            $table->json('terms_snapshot')->nullable();
            $table->enum('status', ['draft', 'submitted', 'approved', 'rejected', 'withdrawn'])->default('draft');
            $table->unsignedInteger('version')->default(0);
            $table->unsignedBigInteger('decided_by_platform_user_id')->nullable();
            $table->text('decision_note')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->timestamp('withdrawn_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['organization_id', 'applicant_platform_user_id', 'status', 'id'], 'lending_applicant_status');
            $table->index(['organization_id', 'applicant_platform_user_id', 'id'], 'lending_applicant_id');
            $table->index(['organization_id', 'status', 'id']);
            $table->index(['organization_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lending_applications');
        Schema::dropIfExists('lending_products');
    }
};
