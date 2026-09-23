<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Order extends Model
{
    use SoftDeletes;

    protected $attributes = ['version' => 0];

    protected $hidden = ['checkout_key', 'deleted_at', 'user_id'];

    public const Placed = 'placed';

    public const Processing = 'processing';

    public const Shipped = 'shipped';

    public const Completed = 'completed';

    public static function options(): array
    {
        return [self::Placed => 'Placed', self::Processing => 'Processing', self::Shipped => 'Shipped', self::Completed => 'Completed'];
    }

    public static function transitions(): array
    {
        return [self::Placed => self::Processing, self::Processing => self::Shipped, self::Shipped => self::Completed];
    }

    protected $guarded = ['id'];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            $model->order_number ??= (string) Str::uuid();
        });
    }

    protected function casts(): array
    {
        return ['items' => 'array', 'shipping_address' => 'array', 'subtotal' => 'integer', 'shipping' => 'integer', 'total' => 'integer'];
    }
}
