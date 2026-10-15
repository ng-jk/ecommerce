<?php

namespace Database\Factories;

use App\Modules\Crm\Models\Contact;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Contact>
 */
class CrmContactFactory extends Factory
{
    protected $model = Contact::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['organization_id' => 1, 'created_by_platform_user_id' => 1, 'updated_by_platform_user_id' => 1,
            'company_id' => null, 'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail()];
    }
}
