<?php

namespace Database\Factories\Modules\Learning\Models;

use App\Modules\Learning\Models\LearningAssessment;
use App\Modules\Learning\Models\LearningCourse;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LearningAssessment> */
class LearningAssessmentFactory extends Factory
{
    protected $model = LearningAssessment::class;

    public function definition(): array
    {
        return ['course_id' => LearningCourse::factory(), 'title' => 'Assessment', 'questions' => [['prompt' => 'One plus one?', 'options' => ['Two', 'Three'], 'correct_index' => 0]], 'pass_score' => 100, 'attempt_limit' => 2];
    }
}
