<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EventDelivery extends Model
{
    use SoftDeletes;

    public const Queued = 'queued';

    public const Processing = 'processing';

    public const Succeeded = 'succeeded';

    public const Failed = 'failed';

    protected $guarded = ['id'];

    protected $hidden = ['lease', 'lease_until', 'subscription_id', 'deleted_at'];

    public static function options(): array
    {
        return [self::Queued => 'Queued', self::Processing => 'Processing', self::Succeeded => 'Succeeded', self::Failed => 'Failed'];
    }
}
