<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_deals', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('pipeline_id');
            $table->unsignedBigInteger('stage_id');
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('contact_id')->nullable();
            $table->unsignedBigInteger('assignee_platform_user_id')->nullable();
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->unsignedBigInteger('updated_by_platform_user_id');
            $table->string('title', 200);
            $table->unsignedBigInteger('amount_minor');
            $table->string('currency', 3);
            $table->string('status', 16)->default('open');
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'pipeline_id', 'stage_id', 'id']);
            $table->index(['organization_id', 'pipeline_id', 'status', 'id']);
            $table->index(['organization_id', 'status', 'id']);
            $table->index(['organization_id', 'assignee_platform_user_id', 'id']);
            $table->index(['organization_id', 'company_id', 'id']);
            $table->foreign(['organization_id', 'pipeline_id'])->references(['organization_id', 'id'])->on('crm_pipelines');
            $table->foreign(['organization_id', 'pipeline_id', 'stage_id'])
                ->references(['organization_id', 'pipeline_id', 'id'])->on('crm_stages');
            $table->foreign(['organization_id', 'company_id'])->references(['organization_id', 'id'])->on('crm_companies');
            $table->foreign(['organization_id', 'contact_id'])->references(['organization_id', 'id'])->on('crm_contacts');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_deals');
    }
};
