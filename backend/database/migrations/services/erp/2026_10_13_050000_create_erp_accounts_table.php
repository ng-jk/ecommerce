<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('erp_accounts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->unsignedBigInteger('updated_by_platform_user_id');
            $table->string('code', 40);
            $table->string('name', 200);
            $table->string('type', 16);
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'type', 'id'], 'erp_accounts_org_type_id');
        });
        DB::statement('CREATE UNIQUE INDEX erp_accounts_org_code ON erp_accounts (organization_id, lower(code))');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS erp_accounts_org_code');
        Schema::dropIfExists('erp_accounts');
    }
};
