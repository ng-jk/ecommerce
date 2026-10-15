<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('crm_contacts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->unsignedBigInteger('updated_by_platform_user_id');
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('name', 200);
            $table->string('email', 254);
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'company_id', 'id']);
            $table->foreign(['organization_id', 'company_id'])->references(['organization_id', 'id'])->on('crm_companies');
        });
        DB::statement('CREATE UNIQUE INDEX crm_contacts_org_email_normalized ON crm_contacts (organization_id, lower(email))');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS crm_contacts_org_email_normalized');
        Schema::dropIfExists('crm_contacts');
    }
};
