<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['items' => 'array', 'shipping_address' => 'array', 'subtotal' => 'integer', 'shipping' => 'integer', 'total' => 'integer'];
    }
}
