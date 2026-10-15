<?php

namespace Database\Factories;

use App\Modules\Erp\Models\Journal;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Journal> */
class ErpJournalFactory extends Factory
{
    protected $model = Journal::class;

    public function definition(): array
    {
        return ['organization_id' => 1, 'created_by_platform_user_id' => 1,
            'updated_by_platform_user_id' => 1, 'effective_date' => now()->toDateString(),
            'description' => fake()->sentence(), 'currency' => 'USD', 'total_minor' => 100,
            'status' => Journal::Draft];
    }
}
