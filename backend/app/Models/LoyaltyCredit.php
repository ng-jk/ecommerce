<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LoyaltyCredit extends Model
{
    use SoftDeletes;

    protected $fillable = ['shop_id', 'user_id', 'operation_id', 'points', 'reason'];

    protected $hidden = ['shop_id', 'user_id', 'operation_id', 'deleted_at'];

    protected function casts(): array
    {
        return ['points' => 'integer'];
    }
}
