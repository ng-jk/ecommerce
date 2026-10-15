<?php

namespace App\Models;

use Database\Factories\ServiceDeliveryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ServiceDelivery extends Model
{
    /** @use HasFactory<ServiceDeliveryFactory> */
    use HasFactory;

    use SoftDeletes;

    public const Queued = 'queued';

    public const Processing = 'processing';

    public const Succeeded = 'succeeded';

    public const Failed = 'failed';

    protected $guarded = ['id'];

    protected $hidden = ['envelope', 'digest', 'lease', 'lease_until', 'deleted_at', 'source', 'destination', 'message_id'];

    /** @return array<string, string> */
    public static function options(): array
    {
        return [self::Queued => 'Queued', self::Processing => 'Processing', self::Succeeded => 'Succeeded', self::Failed => 'Failed'];
    }
}
