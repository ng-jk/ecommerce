<?php

namespace Database\Factories\Modules\Insights\Models;

use App\Modules\Insights\Models\InsightDashboard;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<InsightDashboard> */
class InsightDashboardFactory extends Factory
{
    protected $model = InsightDashboard::class;

    public function definition(): array
    {
        return ['organization_id' => 11, 'owner_platform_user_id' => 7, 'name' => 'Native insights', 'report_ids' => []];
    }
}
