<?php

namespace App\Modules\Learning\Models;

use Database\Factories\Modules\Learning\Models\LearningEnrollmentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearningEnrollment extends Model
{
    public const Active = 'active';

    public const Complete = 'complete';

    /** @use HasFactory<LearningEnrollmentFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Active, 'version' => 0];

    protected static function newFactory(): LearningEnrollmentFactory
    {
        return LearningEnrollmentFactory::new();
    }

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Active => 'Active', self::Complete => 'Delivered and assessed'];
    }
}
