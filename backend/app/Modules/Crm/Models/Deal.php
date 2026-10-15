<?php

namespace App\Modules\Crm\Models;

use Database\Factories\CrmDealFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Deal extends Model
{
    /** @use HasFactory<CrmDealFactory> */
    use HasFactory, SoftDeletes;

    public const Open = 'open';

    public const Won = 'won';

    public const Lost = 'lost';

    protected $table = 'crm_deals';

    protected $fillable = ['organization_id', 'pipeline_id', 'stage_id', 'company_id', 'contact_id',
        'assignee_platform_user_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'title', 'amount_minor', 'currency', 'status', 'version'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Open, 'version' => 0];

    protected function casts(): array
    {
        return ['pipeline_id' => 'integer', 'stage_id' => 'integer', 'company_id' => 'integer',
            'contact_id' => 'integer', 'assignee_platform_user_id' => 'integer',
            'amount_minor' => 'integer', 'version' => 'integer'];
    }

    protected static function newFactory(): CrmDealFactory
    {
        return CrmDealFactory::new();
    }

    public static function options(): array
    {
        return [self::Open => 'Open', self::Won => 'Won', self::Lost => 'Lost'];
    }

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(Pipeline::class);
    }

    public function stage(): BelongsTo
    {
        return $this->belongsTo(Stage::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }
}
