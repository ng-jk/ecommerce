<?php

namespace Database\Factories;

use App\Modules\Crm\Models\Deal;
use App\Modules\Crm\Models\Pipeline;
use App\Modules\Crm\Models\Stage;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Deal>
 */
class CrmDealFactory extends Factory
{
    protected $model = Deal::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['organization_id' => 1, 'pipeline_id' => Pipeline::factory(),
            'stage_id' => Stage::factory(), 'company_id' => null, 'contact_id' => null,
            'assignee_platform_user_id' => null, 'created_by_platform_user_id' => 1,
            'updated_by_platform_user_id' => 1, 'title' => fake()->sentence(),
            'amount_minor' => 10000, 'currency' => 'USD', 'status' => Deal::Open];
    }
}
