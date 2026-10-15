<?php

namespace App\Modules\Hr\Models;

use Database\Factories\Modules\Hr\Models\HrLeaveTypeFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class HrLeaveType extends Model
{
    public const Active = 'active';

    public const Retired = 'retired';

    /** @use HasFactory<HrLeaveTypeFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Active];

    protected static function newFactory(): HrLeaveTypeFactory
    {
        return HrLeaveTypeFactory::new();
    }

    protected function casts(): array
    {
        return ['allowance_days' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Active => 'Active', self::Retired => 'Retired'];
    }
}
