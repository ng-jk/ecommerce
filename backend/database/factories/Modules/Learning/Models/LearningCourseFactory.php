<?php

namespace Database\Factories\Modules\Learning\Models;

use App\Modules\Learning\Models\LearningCourse;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LearningCourse> */
class LearningCourseFactory extends Factory
{
    protected $model = LearningCourse::class;

    public function definition(): array
    {
        return ['organization_id' => 1, 'code' => fake()->unique()->slug(2), 'title' => 'Course', 'description' => 'Course description', 'access_mode' => LearningCourse::Free, 'created_by_platform_user_id' => 1];
    }
}
