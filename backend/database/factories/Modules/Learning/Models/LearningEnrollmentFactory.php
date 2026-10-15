<?php

namespace Database\Factories\Modules\Learning\Models;

use App\Modules\Learning\Models\LearningCourse;
use App\Modules\Learning\Models\LearningEnrollment;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LearningEnrollment> */
class LearningEnrollmentFactory extends Factory
{
    protected $model = LearningEnrollment::class;

    public function definition(): array
    {
        return ['course_id' => LearningCourse::factory(), 'platform_user_id' => 1];
    }
}
