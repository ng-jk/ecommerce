<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Product extends Model
{
    use SoftDeletes;

    protected $attributes = ['version' => 0, 'active' => true];

    protected $hidden = ['deleted_at', 'search_vector'];

    public const Published = '1';

    public const Hidden = '0';

    public static function options(): array
    {
        return [self::Published => 'Published', self::Hidden => 'Hidden'];
    }

    protected $fillable = ['shop_id', 'name', 'category', 'description', 'image_url', 'price', 'stock', 'specifications', 'active'];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            $model->code ??= (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return ['price' => 'integer', 'stock' => 'integer', 'active' => 'boolean', 'specifications' => 'array'];
    }
}
