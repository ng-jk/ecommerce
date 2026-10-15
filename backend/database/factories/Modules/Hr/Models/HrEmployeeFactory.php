<?php

namespace Database\Factories\Modules\Hr\Models;

use App\Modules\Hr\Models\HrEmployee;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HrEmployee>
 */
class HrEmployeeFactory extends Factory
{
    protected $model = HrEmployee::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => 1,
            'linked_platform_user_id' => fake()->unique()->numberBetween(1, 1000000),
            'code' => 'staff-'.fake()->unique()->numerify('######'),
            'display_name' => fake()->name(),
            'timezone' => 'Asia/Kuala_Lumpur',
            'status' => HrEmployee::Active,
        ];
    }
}
