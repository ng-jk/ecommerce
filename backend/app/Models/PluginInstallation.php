<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PluginInstallation extends Model
{
    use SoftDeletes;

    public const Loyalty = 'loyalty';

    protected $fillable = ['shop_id', 'plugin_id', 'version', 'enabled', 'customer_enabled', 'max_credit'];

    protected $hidden = ['shop_id', 'deleted_at'];

    protected function casts(): array
    {
        return ['version' => 'integer', 'enabled' => 'boolean', 'customer_enabled' => 'boolean', 'max_credit' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Loyalty => 'Loyalty'];
    }
}
