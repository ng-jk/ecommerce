<?php

namespace Database\Factories\Modules\Insights\Models;

use App\Modules\Insights\Models\InsightDataset;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<InsightDataset> */
class InsightDatasetFactory extends Factory
{
    protected $model = InsightDataset::class;

    public function definition(): array
    {
        return ['organization_id' => 11, 'owner_platform_user_id' => 7, 'name' => 'Native insights', 'schema' => [['name' => 'value', 'type' => InsightDataset::Integer]], 'rows' => [], 'source_kind' => InsightDataset::Manual];
    }
}
