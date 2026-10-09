<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MiniAppLaunch extends Model
{
    use SoftDeletes;

    protected $guarded = [];

    protected $hidden = ['deleted_at'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'installation_version' => 'integer', 'approval_generation' => 'integer'];
    }
}
