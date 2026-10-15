<?php

namespace App\Modules\Learning\Models;

use Database\Factories\Modules\Learning\Models\LearningAssessmentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearningAssessment extends Model
{
    /** @use HasFactory<LearningAssessmentFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['questions', 'organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['version' => 0];

    protected static function newFactory(): LearningAssessmentFactory
    {
        return LearningAssessmentFactory::new();
    }

    protected function casts(): array
    {
        return ['version' => 'integer', 'questions' => 'encrypted:array', 'pass_score' => 'integer', 'attempt_limit' => 'integer'];
    }
}
