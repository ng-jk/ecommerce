<?php

namespace Database\Factories;

use App\Models\PlatformUser;
use Illuminate\Database\Eloquent\Factories\Factory;

class PlatformConversationFactory extends Factory
{
    public function definition(): array
    {
        return ['public_id' => fake()->uuid(), 'platform_user_id' => PlatformUser::factory(), 'auth_version' => 0,
            'receipt_hash' => hash('sha256', str_repeat('a', 64)), 'draft' => [], 'expires_at' => now()->addMinutes(15)];
    }
}
