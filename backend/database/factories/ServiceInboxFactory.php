<?php

namespace Database\Factories;

use App\Models\ServiceInbox;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceInbox>
 */
class ServiceInboxFactory extends ServiceDeliveryFactory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return parent::definition();
    }
}
