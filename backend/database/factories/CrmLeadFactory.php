<?php

namespace Database\Factories;

use App\Modules\Crm\Models\Lead;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Lead>
 */
class CrmLeadFactory extends Factory
{
    protected $model = Lead::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['organization_id' => 1, 'created_by_platform_user_id' => 1, 'updated_by_platform_user_id' => 1,
            'company_id' => null, 'contact_id' => null,
            'name' => fake()->name(), 'email' => fake()->safeEmail(),
            'status' => Lead::New];
    }
}
