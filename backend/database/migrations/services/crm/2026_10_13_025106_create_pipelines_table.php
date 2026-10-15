<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_pipelines', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->unsignedBigInteger('updated_by_platform_user_id');
            $table->string('code', 80);
            $table->string('name', 200);
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
        });
        DB::statement('CREATE UNIQUE INDEX crm_pipelines_org_code_normalized ON crm_pipelines (organization_id, lower(code))');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS crm_pipelines_org_code_normalized');
        Schema::dropIfExists('crm_pipelines');
    }
};
