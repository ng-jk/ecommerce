<?php

namespace App\Modules\Builder\Models;

use Database\Factories\BuilderPageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Page extends Model
{
    /** @use HasFactory<BuilderPageFactory> */
    use HasFactory, SoftDeletes;

    public const Draft = 'draft';

    public const Published = 'published';

    protected $table = 'builder_pages';

    protected $fillable = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'slug', 'title', 'draft_blocks', 'published_blocks', 'published_title', 'status', 'version',
        'published_version', 'published_at'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'deleted_at', 'created_at', 'updated_at', 'draft_blocks', 'published_blocks'];

    protected $attributes = ['version' => 0, 'status' => self::Draft];

    public static function options(): array
    {
        return [self::Draft => 'Draft', self::Published => 'Published'];
    }

    protected function casts(): array
    {
        return ['draft_blocks' => 'array', 'published_blocks' => 'array', 'version' => 'integer',
            'published_version' => 'integer', 'published_at' => 'datetime'];
    }

    protected static function newFactory(): BuilderPageFactory
    {
        return BuilderPageFactory::new();
    }
}
