<?php

namespace Database\Factories\Modules\Learning\Models;

use App\Modules\Learning\Models\LearningAssessment;
use App\Modules\Learning\Models\LearningAttempt;
use App\Modules\Learning\Models\LearningEnrollment;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LearningAttempt> */
class LearningAttemptFactory extends Factory
{
    protected $model = LearningAttempt::class;

    public function definition(): array
    {
        return ['enrollment_id' => LearningEnrollment::factory(), 'assessment_id' => LearningAssessment::factory(), 'number' => 1, 'score' => 100, 'status' => LearningAttempt::Passed, 'answers' => [0]];
    }
}
