<?php

namespace App\Modules\Hr\Models;

use Database\Factories\Modules\Hr\Models\HrAttendanceCorrectionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class HrAttendanceCorrection extends Model
{
    /** @use HasFactory<HrAttendanceCorrectionFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected static function newFactory(): HrAttendanceCorrectionFactory
    {
        return HrAttendanceCorrectionFactory::new();
    }

    protected function casts(): array
    {
        return ['old_started_at' => 'immutable_datetime', 'old_ended_at' => 'immutable_datetime',
            'new_started_at' => 'immutable_datetime', 'new_ended_at' => 'immutable_datetime'];
    }
}
