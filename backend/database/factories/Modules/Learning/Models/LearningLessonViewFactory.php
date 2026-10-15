<?php

namespace Database\Factories\Modules\Learning\Models;

use App\Modules\Learning\Models\LearningEnrollment;
use App\Modules\Learning\Models\LearningLesson;
use App\Modules\Learning\Models\LearningLessonView;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LearningLessonView> */
class LearningLessonViewFactory extends Factory
{
    protected $model = LearningLessonView::class;

    public function definition(): array
    {
        return ['enrollment_id' => LearningEnrollment::factory(), 'lesson_id' => LearningLesson::factory()];
    }
}
