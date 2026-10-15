<?php

namespace App\Modules\Learning\Models;

use Database\Factories\Modules\Learning\Models\LearningAttemptFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearningAttempt extends Model
{
    public const Passed = 'passed';

    public const Failed = 'failed';

    /** @use HasFactory<LearningAttemptFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['answers', 'organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = [];

    protected static function newFactory(): LearningAttemptFactory
    {
        return LearningAttemptFactory::new();
    }

    protected function casts(): array
    {
        return ['answers' => 'encrypted:array', 'score' => 'integer', 'number' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Passed => 'Passed', self::Failed => 'Failed'];
    }
}
