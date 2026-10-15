<?php

namespace Database\Factories;

use App\Modules\Erp\Models\Account;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Account> */
class ErpAccountFactory extends Factory
{
    protected $model = Account::class;

    public function definition(): array
    {
        return ['organization_id' => 1, 'created_by_platform_user_id' => 1,
            'updated_by_platform_user_id' => 1, 'code' => fake()->unique()->bothify('####-####'),
            'name' => fake()->words(2, true), 'type' => Account::Asset];
    }
}
