<?php

namespace Database\Factories;

use App\Models\ServiceDelivery;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceDelivery>
 */
class ServiceDeliveryFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $message = ['id' => fake()->uuid(), 'source' => 'platform', 'destination' => 'crm',
            'topic' => 'organization.changed', 'version' => 1, 'payload' => ['organization' => 1]];
        $encoded = json_encode($message, JSON_THROW_ON_ERROR);

        return ['message_id' => $message['id'], 'source' => 'platform', 'destination' => 'crm',
            'envelope' => $encoded, 'digest' => hash('sha256', $encoded),
            'status' => ServiceDelivery::Queued, 'available_at' => now()];
    }
}
