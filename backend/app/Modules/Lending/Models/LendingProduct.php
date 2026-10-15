<?php

namespace App\Modules\Lending\Models;

use Database\Factories\Modules\Lending\Models\LendingProductFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LendingProduct extends Model
{
    public const Draft = 'draft';

    public const Active = 'active';

    public const Disabled = 'disabled';

    /** @use HasFactory<LendingProductFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'created_at', 'updated_at', 'deleted_at'];

    protected $attributes = ['status' => self::Draft, 'version' => 0];

    protected static function newFactory(): LendingProductFactory
    {
        return LendingProductFactory::new();
    }

    protected function casts(): array
    {
        return ['version' => 'integer', 'principal_min_minor' => 'integer', 'principal_max_minor' => 'integer', 'term_rate_numerator' => 'integer', 'term_rate_denominator' => 'integer', 'installment_count' => 'integer', 'interval_days' => 'integer', 'minor_unit_digits' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Draft => 'Draft', self::Active => 'Active', self::Disabled => 'Disabled'];
    }
}
