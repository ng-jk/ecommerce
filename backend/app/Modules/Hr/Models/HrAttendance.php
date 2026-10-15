<?php

namespace App\Modules\Hr\Models;

use Database\Factories\Modules\Hr\Models\HrAttendanceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class HrAttendance extends Model
{
    /** @use HasFactory<HrAttendanceFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['version' => 0];

    protected static function newFactory(): HrAttendanceFactory
    {
        return HrAttendanceFactory::new();
    }

    protected function casts(): array
    {
        return ['started_at' => 'immutable_datetime', 'ended_at' => 'immutable_datetime',
            'version' => 'integer'];
    }
}
