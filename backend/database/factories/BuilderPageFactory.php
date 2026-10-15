<?php

namespace Database\Factories;

use App\Modules\Builder\Models\Page;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Page> */
class BuilderPageFactory extends Factory
{
    protected $model = Page::class;

    public function definition(): array
    {
        return ['organization_id' => 1, 'created_by_platform_user_id' => 1,
            'updated_by_platform_user_id' => 1, 'slug' => fake()->unique()->slug(),
            'title' => fake()->sentence(), 'draft_blocks' => [], 'status' => Page::Draft];
    }
}
