<?php

namespace Database\Factories\Modules\Hr\Models;

use App\Modules\Hr\Models\HrLeaveRequest;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HrLeaveRequest>
 */
class HrLeaveRequestFactory extends Factory
{
    protected $model = HrLeaveRequest::class;

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
            'leave_type_id' => 1,
            'start_date' => today()->addDays(3)->toDateString(),
            'end_date' => today()->addDays(4)->toDateString(),
            'calendar_days' => 2,
            'status' => HrLeaveRequest::Pending,
        ];
    }
}
