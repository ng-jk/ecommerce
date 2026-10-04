<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LoyaltyBalance extends Model
{
    use SoftDeletes;

    protected $fillable = ['shop_id', 'user_id', 'points'];

    protected $hidden = ['shop_id', 'user_id', 'deleted_at'];

    protected function casts(): array
    {
        return ['points' => 'integer'];
    }
}
