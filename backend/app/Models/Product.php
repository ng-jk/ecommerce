<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $fillable = ['shop_id', 'name', 'category', 'description', 'image_url', 'price', 'stock', 'specifications', 'active'];

    protected function casts(): array
    {
        return ['price' => 'integer', 'stock' => 'integer', 'active' => 'boolean', 'specifications' => 'array'];
    }
}
