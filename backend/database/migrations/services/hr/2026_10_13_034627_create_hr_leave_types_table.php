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
        Schema::create('hr_leave_types', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('code', 80);
            $table->string('name', 160);
            $table->unsignedSmallInteger('allowance_days');
            $table->string('status', 24)->default('active');
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'status', 'id']);
        });
        DB::statement('CREATE UNIQUE INDEX hr_leave_type_org_code_normalized ON hr_leave_types (organization_id, lower(code))');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE hr_leave_types ADD CONSTRAINT hr_leave_type_status CHECK (status IN ('active', 'retired'))");
            DB::statement('ALTER TABLE hr_leave_types ADD CONSTRAINT hr_leave_type_allowance CHECK (allowance_days BETWEEN 0 AND 366)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hr_leave_types');
    }
};
