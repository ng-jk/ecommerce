<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MiniAppVersion extends Model
{
    use SoftDeletes;

    protected $guarded = [];

    protected $hidden = ['deleted_at', 'archive_path', 'asset_hashes', 'approved_by', 'revoked_by', 'revoked_at', 'approval_generation'];

    protected function casts(): array
    {
        return ['manifest' => 'array', 'asset_hashes' => 'array', 'approved_at' => 'datetime', 'revoked_at' => 'datetime', 'approval_generation' => 'integer'];
    }
}
