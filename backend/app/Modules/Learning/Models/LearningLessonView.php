<?php

namespace App\Modules\Learning\Models;

use Database\Factories\Modules\Learning\Models\LearningLessonViewFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearningLessonView extends Model
{
    /** @use HasFactory<LearningLessonViewFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = [];

    protected static function newFactory(): LearningLessonViewFactory
    {
        return LearningLessonViewFactory::new();
    }

    protected function casts(): array
    {
        return [];
    }
}
