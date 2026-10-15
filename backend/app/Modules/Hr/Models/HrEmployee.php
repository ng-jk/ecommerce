<?php

namespace App\Modules\Hr\Models;

use Database\Factories\Modules\Hr\Models\HrEmployeeFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class HrEmployee extends Model
{
    public const Active = 'active';

    public const Inactive = 'inactive';

    public const Terminated = 'terminated';

    /** @use HasFactory<HrEmployeeFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Active, 'version' => 0];

    protected static function newFactory(): HrEmployeeFactory
    {
        return HrEmployeeFactory::new();
    }

    protected function casts(): array
    {
        return ['linked_platform_user_id' => 'integer', 'version' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Active => 'Active', self::Inactive => 'Inactive', self::Terminated => 'Terminated'];
    }
}
