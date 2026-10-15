<?php

namespace App\Modules\Learning\Models;

use Database\Factories\Modules\Learning\Models\LearningLessonFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearningLesson extends Model
{
    /** @use HasFactory<LearningLessonFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['version' => 0];

    protected static function newFactory(): LearningLessonFactory
    {
        return LearningLessonFactory::new();
    }

    protected function casts(): array
    {
        return ['version' => 'integer', 'position' => 'integer'];
    }
}
