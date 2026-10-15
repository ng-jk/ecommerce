<?php

namespace App\Modules\Crm\Models;

use Database\Factories\CrmStageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Stage extends Model
{
    /** @use HasFactory<CrmStageFactory> */
    use HasFactory, SoftDeletes;

    public const Open = 'open';

    public const Won = 'won';

    public const Lost = 'lost';

    protected $table = 'crm_stages';

    protected $fillable = ['organization_id', 'pipeline_id', 'created_by_platform_user_id',
        'updated_by_platform_user_id', 'code', 'name', 'position', 'outcome', 'version'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['outcome' => self::Open, 'version' => 0];

    protected function casts(): array
    {
        return ['pipeline_id' => 'integer', 'position' => 'integer', 'version' => 'integer'];
    }

    protected static function newFactory(): CrmStageFactory
    {
        return CrmStageFactory::new();
    }

    public static function options(): array
    {
        return [self::Open => 'Open', self::Won => 'Won', self::Lost => 'Lost'];
    }

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(Pipeline::class);
    }
}
