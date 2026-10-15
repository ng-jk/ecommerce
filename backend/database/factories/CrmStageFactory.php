<?php

namespace Database\Factories;

use App\Modules\Crm\Models\Pipeline;
use App\Modules\Crm\Models\Stage;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Stage>
 */
class CrmStageFactory extends Factory
{
    protected $model = Stage::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['organization_id' => 1, 'pipeline_id' => Pipeline::factory(),
            'created_by_platform_user_id' => 1, 'updated_by_platform_user_id' => 1,
            'code' => fake()->unique()->slug(2), 'name' => fake()->words(2, true),
            'position' => fake()->unique()->numberBetween(1, 1000), 'outcome' => Stage::Open];
    }
}
