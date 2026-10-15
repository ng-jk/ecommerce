<?php

namespace Database\Factories\Modules\Learning\Models;

use App\Modules\Learning\Models\LearningCourse;
use App\Modules\Learning\Models\LearningLesson;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LearningLesson> */
class LearningLessonFactory extends Factory
{
    protected $model = LearningLesson::class;

    public function definition(): array
    {
        return ['course_id' => LearningCourse::factory(), 'title' => 'Lesson', 'content' => 'Lesson content', 'position' => 1];
    }
}
