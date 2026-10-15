<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('crm_leads', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('created_by_platform_user_id');
            $table->unsignedBigInteger('updated_by_platform_user_id');
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('contact_id')->nullable();
            $table->string('name', 200);
            $table->string('email', 254);
            $table->string('status', 24)->default('new');
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['organization_id', 'id']);
            $table->index(['organization_id', 'status', 'id']);
            $table->index(['organization_id', 'company_id', 'id']);
            $table->index(['organization_id', 'status', 'company_id', 'id']);
            $table->foreign(['organization_id', 'company_id'])->references(['organization_id', 'id'])->on('crm_companies');
            $table->foreign(['organization_id', 'contact_id'])->references(['organization_id', 'id'])->on('crm_contacts');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('crm_leads');
    }
};
