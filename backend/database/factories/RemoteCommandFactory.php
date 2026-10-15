<?php

namespace Database\Factories;

use App\Models\RemoteCommand;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<RemoteCommand>
 */
class RemoteCommandFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'command_id' => (string) Str::uuid(),
            'service' => 'crm', 'action' => 'crm.companies.list',
            'deadline_at' => now()->addMinutes(5),
        ];
    }
}
