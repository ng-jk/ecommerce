<?php

namespace App\Modules\Helpdesk\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class HelpdeskTicket extends Model
{
    use SoftDeletes;

    public const Open = 'open';

    public const Pending = 'pending';

    public const Resolved = 'resolved';

    public const Closed = 'closed';

    protected $fillable = ['organization_id', 'queue_id', 'requester_platform_user_id',
        'assigned_platform_user_id', 'subject', 'description', 'status', 'version'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Open, 'version' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Open => 'Open', self::Pending => 'Pending',
            self::Resolved => 'Resolved', self::Closed => 'Closed'];
    }
}
