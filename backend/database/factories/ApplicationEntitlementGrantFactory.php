<?php

namespace Database\Factories;

use App\Models\ApplicationEntitlementGrant;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ApplicationEntitlementGrant>
 */
class ApplicationEntitlementGrantFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'application_key' => 'framework',
            'source' => ApplicationEntitlementGrant::Free,
            'evidence_ref' => $this->faker->uuid(),
            'starts_at' => now(),
            'expires_at' => null,
            'evidence' => ['kind' => 'fixture'],
        ];
    }
}
