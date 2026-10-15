<?php

namespace Database\Factories\Modules\Hr\Models;

use App\Modules\Hr\Models\HrAttendanceCorrection;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HrAttendanceCorrection>
 */
class HrAttendanceCorrectionFactory extends Factory
{
    protected $model = HrAttendanceCorrection::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => 1,
            'attendance_id' => 1,
            'corrected_by_platform_user_id' => 2,
            'old_started_at' => now()->subHours(9),
            'old_ended_at' => now()->subHour(),
            'new_started_at' => now()->subHours(8),
            'new_ended_at' => now()->subHour(),
            'reason' => 'Manager correction',
        ];
    }
}
