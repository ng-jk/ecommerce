<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class MiniAppInstallation extends Model
{
    use SoftDeletes;

    protected $guarded = [];

    protected $hidden = ['deleted_at'];

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'grants' => 'array', 'version' => 'integer'];
    }

    public function release(): BelongsTo
    {
        return $this->belongsTo(MiniAppVersion::class, 'mini_app_version_id');
    }
}
