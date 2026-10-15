<?php

namespace Database\Factories\Modules\Learning\Models;

use App\Modules\Learning\Models\LearningCourse;
use App\Modules\Learning\Models\LearningCourseAccessGrant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<LearningCourseAccessGrant> */
class LearningCourseAccessGrantFactory extends Factory
{
    protected $model = LearningCourseAccessGrant::class;

    public function definition(): array
    {
        return ['course_id' => LearningCourse::factory(), 'platform_user_id' => 1, 'source' => LearningCourseAccessGrant::VerifiedSettlement, 'evidence_ref' => (string) Str::uuid()];
    }
}
