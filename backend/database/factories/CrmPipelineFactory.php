<?php

namespace Database\Factories;

use App\Modules\Crm\Models\Pipeline;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Pipeline>
 */
class CrmPipelineFactory extends Factory
{
    protected $model = Pipeline::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['organization_id' => 1, 'created_by_platform_user_id' => 1,
            'updated_by_platform_user_id' => 1, 'code' => fake()->unique()->slug(2),
            'name' => fake()->words(2, true)];
    }
}
