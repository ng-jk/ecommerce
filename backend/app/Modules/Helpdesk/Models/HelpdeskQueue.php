<?php

namespace App\Modules\Helpdesk\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class HelpdeskQueue extends Model
{
    use SoftDeletes;

    public const Active = 'active';

    public const Disabled = 'disabled';

    protected $fillable = ['organization_id', 'code', 'name', 'status', 'version'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Active, 'version' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Active => 'Active', self::Disabled => 'Disabled'];
    }
}
