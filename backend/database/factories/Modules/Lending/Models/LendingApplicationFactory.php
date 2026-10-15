<?php

namespace Database\Factories\Modules\Lending\Models;

use App\Modules\Lending\Models\LendingApplication;
use App\Modules\Lending\Models\LendingProduct;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LendingApplication> */
class LendingApplicationFactory extends Factory
{
    protected $model = LendingApplication::class;

    public function definition(): array
    {
        return ['organization_id' => 11, 'applicant_platform_user_id' => 7, 'product_id' => LendingProduct::factory(), 'principal_minor' => 100, 'first_due_date' => now('UTC')->addDays(30)->format('Y-m-d'), 'purpose' => 'Working capital', 'status' => LendingApplication::Draft];
    }
}
