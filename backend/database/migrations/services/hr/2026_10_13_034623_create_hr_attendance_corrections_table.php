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
        Schema::create('hr_attendance_corrections', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('attendance_id');
            $table->unsignedBigInteger('corrected_by_platform_user_id');
            $table->timestampTz('old_started_at');
            $table->timestampTz('old_ended_at');
            $table->timestampTz('new_started_at');
            $table->timestampTz('new_ended_at');
            $table->text('reason');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['organization_id', 'attendance_id', 'id'], 'hr_correction_attendance_index');
            $table->foreign(['organization_id', 'attendance_id'], 'hr_correction_attendance_fk')
                ->references(['organization_id', 'id'])->on('hr_attendances');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hr_attendance_corrections');
    }
};
