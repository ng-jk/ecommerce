<?php

namespace Database\Factories\Modules\Insights\Models;

use App\Modules\Insights\Models\InsightDataset;
use App\Modules\Insights\Models\InsightReport;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<InsightReport> */
class InsightReportFactory extends Factory
{
    protected $model = InsightReport::class;

    public function definition(): array
    {
        return ['organization_id' => 11, 'owner_platform_user_id' => 7, 'name' => 'Native insights', 'dataset_id' => InsightDataset::factory(), 'definition' => ['metric' => ['aggregate' => InsightDataset::Count]]];
    }
}
