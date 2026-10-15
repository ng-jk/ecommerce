<?php

namespace App\Modules\Hr\Models;

use Database\Factories\Modules\Hr\Models\HrLeaveRequestFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class HrLeaveRequest extends Model
{
    public const Pending = 'pending';

    public const Approved = 'approved';

    public const Rejected = 'rejected';

    /** @use HasFactory<HrLeaveRequestFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Pending, 'version' => 0];

    protected static function newFactory(): HrLeaveRequestFactory
    {
        return HrLeaveRequestFactory::new();
    }

    protected function casts(): array
    {
        return ['calendar_days' => 'integer', 'version' => 'integer',
            'decided_by_platform_user_id' => 'integer', 'decided_at' => 'immutable_datetime'];
    }

    public static function options(): array
    {
        return [self::Pending => 'Pending', self::Approved => 'Approved', self::Rejected => 'Rejected'];
    }
}
