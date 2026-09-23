<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Operation extends Model
{
    use SoftDeletes;

    public const Queued = 'queued';

    public const Processing = 'processing';

    public const Succeeded = 'succeeded';

    public const Rejected = 'rejected';

    public const Failed = 'failed';

    protected $guarded = ['id'];

    protected $hidden = ['payload', 'payload_hash', 'receipt_hash', 'scope', 'token_id', 'auth_version', 'deleted_at'];

    public static function options(): array
    {
        return [self::Queued => 'Queued', self::Processing => 'Processing', self::Succeeded => 'Succeeded', self::Rejected => 'Rejected', self::Failed => 'Failed'];
    }

    protected function casts(): array
    {
        return ['payload' => 'encrypted:array', 'result' => 'encrypted:array', 'state_before' => 'array', 'state_after' => 'array', 'available_at' => 'datetime'];
    }
}
