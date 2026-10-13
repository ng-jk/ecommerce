<?php

namespace Database\Factories;

use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Organization> */
class OrganizationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => fake()->unique()->bothify('org-########'),
            'name' => fake()->company(),
            'status' => Organization::Active,
        ];
    }
}
