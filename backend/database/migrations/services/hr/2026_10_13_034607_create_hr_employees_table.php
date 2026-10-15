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
        Schema::create('hr_employees', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('linked_platform_user_id');
            $table->string('code', 80);
            $table->string('display_name', 200);
            $table->string('timezone', 64);
            $table->string('status', 24)->default('active');
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->unique(['organization_id', 'linked_platform_user_id'], 'hr_employee_org_principal_unique');
            $table->index(['organization_id', 'status', 'id']);
        });
        DB::statement('CREATE UNIQUE INDEX hr_employee_org_code_normalized ON hr_employees (organization_id, lower(code))');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE hr_employees ADD CONSTRAINT hr_employee_status CHECK (status IN ('active', 'inactive', 'terminated'))");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hr_employees');
    }
};
