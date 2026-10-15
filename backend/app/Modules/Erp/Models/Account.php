<?php

namespace App\Modules\Erp\Models;

use Database\Factories\ErpAccountFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Account extends Model
{
    /** @use HasFactory<ErpAccountFactory> */
    use HasFactory, SoftDeletes;

    public const Asset = 'asset';

    public const Liability = 'liability';

    public const Equity = 'equity';

    public const Revenue = 'revenue';

    public const Expense = 'expense';

    protected $table = 'erp_accounts';

    protected $fillable = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'code', 'name', 'type', 'version'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'created_at', 'updated_at', 'deleted_at'];

    protected $attributes = ['version' => 0];

    public static function options(): array
    {
        return [self::Asset => 'Asset', self::Liability => 'Liability', self::Equity => 'Equity',
            self::Revenue => 'Revenue', self::Expense => 'Expense'];
    }

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    protected static function newFactory(): ErpAccountFactory
    {
        return ErpAccountFactory::new();
    }
}
