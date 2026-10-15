<?php

namespace App\Modules\Crm\Models;

use Database\Factories\CrmPipelineFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Pipeline extends Model
{
    /** @use HasFactory<CrmPipelineFactory> */
    use HasFactory, SoftDeletes;

    protected $table = 'crm_pipelines';

    protected $fillable = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'code', 'name', 'version'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['version' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    protected static function newFactory(): CrmPipelineFactory
    {
        return CrmPipelineFactory::new();
    }

    public function stages(): HasMany
    {
        return $this->hasMany(Stage::class);
    }
}
