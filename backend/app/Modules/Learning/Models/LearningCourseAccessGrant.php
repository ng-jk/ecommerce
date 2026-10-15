<?php

namespace App\Modules\Learning\Models;

use Database\Factories\Modules\Learning\Models\LearningCourseAccessGrantFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearningCourseAccessGrant extends Model
{
    public const VerifiedSettlement = 'verified_settlement';

    /** @use HasFactory<LearningCourseAccessGrantFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['evidence_ref', 'organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = [];

    protected static function newFactory(): LearningCourseAccessGrantFactory
    {
        return LearningCourseAccessGrantFactory::new();
    }

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public static function options(): array
    {
        return [self::VerifiedSettlement => 'Verified settlement'];
    }
}
