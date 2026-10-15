<?php

namespace Database\Factories\Modules\Hr\Models;

use App\Modules\Hr\Models\HrLeaveType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HrLeaveType>
 */
class HrLeaveTypeFactory extends Factory
{
    protected $model = HrLeaveType::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => 1,
            'code' => 'leave-'.fake()->unique()->numerify('######'),
            'name' => fake()->words(2, true),
            'allowance_days' => 20,
            'status' => HrLeaveType::Active,
        ];
    }
}
