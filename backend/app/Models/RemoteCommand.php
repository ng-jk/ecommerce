<?php

namespace App\Models;

use Database\Factories\RemoteCommandFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class RemoteCommand extends Model
{
    /** @use HasFactory<RemoteCommandFactory> */
    use HasFactory, SoftDeletes;

    public const Waiting = 'waiting';

    public const Succeeded = 'succeeded';

    public const Rejected = 'rejected';

    protected $guarded = ['id'];

    protected $hidden = ['result', 'response_digest', 'operation_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Waiting];

    public static function options(): array
    {
        return [self::Waiting => 'Waiting for service', self::Succeeded => 'Completed', self::Rejected => 'Rejected'];
    }

    protected function casts(): array
    {
        return ['result' => 'encrypted:array', 'deadline_at' => 'datetime', 'http_status' => 'integer'];
    }
}
