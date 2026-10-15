<?php

namespace Database\Factories\Modules\Lending\Models;

use App\Modules\Lending\Models\LendingProduct;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LendingProduct> */
class LendingProductFactory extends Factory
{
    protected $model = LendingProduct::class;

    public function definition(): array
    {
        return ['organization_id' => 11, 'code' => fake()->unique()->lexify('product-??????'), 'name' => 'Configured product', 'jurisdiction_label' => 'Operator scope', 'terms_text' => 'Whole-term fixed charge; no settlement recorded.', 'currency' => 'MYR', 'minor_unit_digits' => 2, 'principal_min_minor' => 1, 'principal_max_minor' => 1000000, 'term_rate_numerator' => 1, 'term_rate_denominator' => 10, 'installment_count' => 3, 'interval_days' => 30, 'status' => LendingProduct::Draft];
    }
}
