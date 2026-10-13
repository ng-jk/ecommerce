<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationApplication;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<OrganizationApplication> */
class OrganizationApplicationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'application_key' => 'framework',
            'state' => OrganizationApplication::Disabled,
        ];
    }
}
