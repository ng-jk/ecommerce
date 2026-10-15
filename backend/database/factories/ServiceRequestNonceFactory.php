<?php

namespace Database\Factories;

use App\Models\ServiceRequestNonce;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceRequestNonce>
 */
class ServiceRequestNonceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['source' => 'platform', 'nonce' => fake()->uuid()];
    }
}
