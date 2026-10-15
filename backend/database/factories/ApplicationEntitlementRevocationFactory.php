<?php

namespace Database\Factories;

use App\Models\ApplicationEntitlementGrant;
use App\Models\ApplicationEntitlementRevocation;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ApplicationEntitlementRevocation>
 */
class ApplicationEntitlementRevocationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'grant_id' => ApplicationEntitlementGrant::factory(),
            'reason' => 'Test revocation',
            'evidence_ref' => $this->faker->uuid(),
            'revoked_at' => now(),
        ];
    }
}
