<?php

namespace Database\Factories;

use App\Modules\Crm\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Company>
 */
class CrmCompanyFactory extends Factory
{
    protected $model = Company::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['organization_id' => 1, 'created_by_platform_user_id' => 1, 'updated_by_platform_user_id' => 1,
            'code' => fake()->unique()->slug(2),
            'name' => fake()->company()];
    }
}
