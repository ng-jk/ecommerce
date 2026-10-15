<?php

namespace App\Modules\Insights\Models;

use Database\Factories\Modules\Insights\Models\InsightReportFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class InsightReport extends Model
{
    public const Active = 'active';

    public const Disabled = 'disabled';

    public const Private = 'private';

    public const Organization = 'organization';

    /** @use HasFactory<InsightReportFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'owner_platform_user_id', 'created_at', 'updated_at', 'deleted_at'];

    protected $attributes = ['status' => self::Active, 'visibility' => self::Private, 'version' => 0];

    protected static function newFactory(): InsightReportFactory
    {
        return InsightReportFactory::new();
    }

    protected function casts(): array
    {
        return ['definition' => 'array', 'version' => 'integer'];
    }

    public static function options(string $field = 'status'): array
    {
        return $field === 'visibility' ? [self::Private => 'Private', self::Organization => 'Organization'] : [self::Active => 'Active', self::Disabled => 'Disabled'];
    }
}
