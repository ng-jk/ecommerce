<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_stages', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('pipeline_id');
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->unsignedBigInteger('updated_by_platform_user_id');
            $table->string('code', 80);
            $table->string('name', 200);
            $table->unsignedSmallInteger('position');
            $table->string('outcome', 16)->default('open');
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->unique(['organization_id', 'pipeline_id', 'id']);
            $table->unique(['organization_id', 'pipeline_id', 'position']);
            $table->index(['organization_id', 'pipeline_id', 'id']);
            $table->index(['organization_id', 'pipeline_id', 'outcome', 'position', 'id'],
                'crm_stages_org_pipeline_outcome_position_id');
            $table->foreign(['organization_id', 'pipeline_id'])->references(['organization_id', 'id'])->on('crm_pipelines');
        });
        DB::statement('CREATE UNIQUE INDEX crm_stages_pipeline_code_normalized ON crm_stages (organization_id, pipeline_id, lower(code))');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS crm_stages_pipeline_code_normalized');
        Schema::dropIfExists('crm_stages');
    }
};
