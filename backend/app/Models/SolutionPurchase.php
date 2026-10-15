<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SolutionPurchase extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['buyer_user_id', 'payment_id', 'deleted_at', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['quoted_total' => 'integer'];
    }
}
