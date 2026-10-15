<?php

namespace Database\Factories;

use App\Modules\Crm\Models\Activity;
use App\Modules\Crm\Models\Deal;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Activity>
 */
class CrmActivityFactory extends Factory
{
    protected $model = Activity::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['organization_id' => 1, 'deal_id' => Deal::factory(),
            'created_by_platform_user_id' => 1, 'type' => Activity::Note,
            'summary' => fake()->sentence(), 'occurred_at' => now()];
    }
}
