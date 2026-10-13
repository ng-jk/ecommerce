<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\OrganizationMembership;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<OrganizationMembership> */
class OrganizationMembershipFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'user_id' => null,
            'role' => OrganizationMembership::Member,
            'status' => OrganizationMembership::Invited,
        ];
    }
}
