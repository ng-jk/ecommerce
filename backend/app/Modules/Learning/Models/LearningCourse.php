<?php

namespace App\Modules\Learning\Models;

use Database\Factories\Modules\Learning\Models\LearningCourseFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearningCourse extends Model
{
    public const Draft = 'draft';

    public const Published = 'published';

    public const Archived = 'archived';

    public const Free = 'free';

    public const Paid = 'paid';

    /** @use HasFactory<LearningCourseFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Draft, 'access_mode' => self::Free, 'version' => 0];

    protected static function newFactory(): LearningCourseFactory
    {
        return LearningCourseFactory::new();
    }

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    public static function options(string $field = 'status'): array
    {
        if ($field === 'access_mode') {
            return [self::Free => 'Free', self::Paid => 'Paid'];
        }

        return [self::Draft => 'Draft', self::Published => 'Published', self::Archived => 'Archived'];
    }
}
