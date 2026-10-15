<?php

namespace App\Modules\Crm\Models;

use Database\Factories\CrmActivityFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Activity extends Model
{
    /** @use HasFactory<CrmActivityFactory> */
    use HasFactory, SoftDeletes;

    public const Note = 'note';

    public const Call = 'call';

    public const Email = 'email';

    public const Meeting = 'meeting';

    protected $table = 'crm_activities';

    protected $fillable = ['organization_id', 'deal_id', 'created_by_platform_user_id',
        'type', 'summary', 'occurred_at'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id',
        'deleted_at', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['deal_id' => 'integer', 'occurred_at' => 'immutable_datetime'];
    }

    protected static function newFactory(): CrmActivityFactory
    {
        return CrmActivityFactory::new();
    }

    public static function options(): array
    {
        return [self::Note => 'Note', self::Call => 'Call', self::Email => 'Email', self::Meeting => 'Meeting'];
    }

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }
}
