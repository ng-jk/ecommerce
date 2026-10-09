<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class MiniAppPackage extends Model
{
    use SoftDeletes;

    public const Public = 'public';

    public const Private = 'private';

    protected $guarded = [];

    protected $hidden = ['deleted_at'];

    public static function options(): array
    {
        return [self::Public => 'Public', self::Private => 'Private'];
    }

    public function versions(): HasMany
    {
        return $this->hasMany(MiniAppVersion::class, 'package_id');
    }
}
