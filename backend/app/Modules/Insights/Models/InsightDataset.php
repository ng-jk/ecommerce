<?php

namespace App\Modules\Insights\Models;

use Database\Factories\Modules\Insights\Models\InsightDatasetFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class InsightDataset extends Model
{
    public const Active = 'active';

    public const Disabled = 'disabled';

    public const Private = 'private';

    public const Organization = 'organization';

    public const Manual = 'manual';

    public const Text = 'string';

    public const Integer = 'integer';

    public const Boolean = 'boolean';

    public const Count = 'count';

    public const Sum = 'sum';

    public const Average = 'avg';

    /** @use HasFactory<InsightDatasetFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['rows', 'organization_id', 'owner_platform_user_id', 'created_at', 'updated_at', 'deleted_at'];

    protected $attributes = ['status' => self::Active, 'visibility' => self::Private, 'version' => 0];

    protected static function newFactory(): InsightDatasetFactory
    {
        return InsightDatasetFactory::new();
    }

    protected function casts(): array
    {
        return ['schema' => 'array', 'rows' => 'encrypted:array', 'imported_at' => 'datetime', 'version' => 'integer'];
    }

    public static function options(string $field = 'status'): array
    {
        if ($field === 'type') {
            return [self::Text => 'Text', self::Integer => 'Integer', self::Boolean => 'Boolean'];
        }
        if ($field === 'aggregate') {
            return [self::Count => 'Count', self::Sum => 'Sum', self::Average => 'Exact average'];
        }
        if ($field === 'source_kind') {
            return [self::Manual => 'Manual import'];
        }

        return $field === 'visibility' ? [self::Private => 'Private', self::Organization => 'Organization'] : [self::Active => 'Active', self::Disabled => 'Disabled'];
    }
}
