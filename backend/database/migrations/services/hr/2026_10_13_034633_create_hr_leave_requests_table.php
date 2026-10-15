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
        Schema::create('hr_leave_requests', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('employee_id');
            $table->unsignedBigInteger('leave_type_id');
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedSmallInteger('calendar_days');
            $table->string('status', 24)->default('pending');
            $table->unsignedBigInteger('version')->default(0);
            $table->unsignedBigInteger('decided_by_platform_user_id')->nullable();
            $table->timestampTz('decided_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'employee_id', 'status', 'start_date', 'id'], 'hr_leave_employee_index');
            $table->index(['organization_id', 'status', 'id'], 'hr_leave_status_index');
            $table->foreign(['organization_id', 'employee_id'], 'hr_leave_employee_fk')
                ->references(['organization_id', 'id'])->on('hr_employees');
            $table->foreign(['organization_id', 'leave_type_id'], 'hr_leave_type_fk')
                ->references(['organization_id', 'id'])->on('hr_leave_types');
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE hr_leave_requests ADD CONSTRAINT hr_leave_status CHECK (status IN ('pending', 'approved', 'rejected'))");
            DB::statement('ALTER TABLE hr_leave_requests ADD CONSTRAINT hr_leave_order CHECK (end_date >= start_date)');
            DB::statement('ALTER TABLE hr_leave_requests ADD CONSTRAINT hr_leave_days CHECK (calendar_days BETWEEN 1 AND 31)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hr_leave_requests');
    }
};
