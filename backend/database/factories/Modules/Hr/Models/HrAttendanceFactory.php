<?php

namespace Database\Factories\Modules\Hr\Models;

use App\Modules\Hr\Models\HrAttendance;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HrAttendance>
 */
class HrAttendanceFactory extends Factory
{
    protected $model = HrAttendance::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => 1,
            'employee_id' => 1,
            'started_at' => now()->subHours(9),
            'ended_at' => now()->subHour(),
            'local_date' => now('Asia/Kuala_Lumpur')->toDateString(),
            'timezone' => 'Asia/Kuala_Lumpur',
        ];
    }
}
