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
        Schema::create('hr_attendances', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('employee_id');
            $table->timestampTz('started_at');
            $table->timestampTz('ended_at');
            $table->date('local_date');
            $table->string('timezone', 64);
            $table->unsignedBigInteger('version')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['organization_id', 'id']);
            $table->index(['organization_id', 'employee_id', 'local_date', 'id'], 'hr_attendance_employee_day_index');
            $table->foreign(['organization_id', 'employee_id'], 'hr_attendance_employee_fk')
                ->references(['organization_id', 'id'])->on('hr_employees');
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE hr_attendances ADD CONSTRAINT hr_attendance_order CHECK (ended_at > started_at)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hr_attendances');
    }
};
