<?php

namespace App\Modules\Erp\Models;

use Database\Factories\ErpJournalFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Journal extends Model
{
    /** @use HasFactory<ErpJournalFactory> */
    use HasFactory, SoftDeletes;

    public const Draft = 'draft';

    public const Posted = 'posted';

    protected $table = 'erp_journals';

    protected $fillable = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'effective_date', 'description', 'currency', 'status', 'version', 'total_minor',
        'posted_at', 'reverses_journal_id'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'created_at', 'updated_at', 'deleted_at'];

    protected $attributes = ['version' => 0, 'status' => self::Draft];

    public static function options(): array
    {
        return [self::Draft => 'Draft', self::Posted => 'Posted'];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class)->orderBy('position');
    }

    protected function casts(): array
    {
        return ['effective_date' => 'date:Y-m-d', 'version' => 'integer', 'total_minor' => 'integer',
            'posted_at' => 'datetime', 'reverses_journal_id' => 'integer'];
    }

    protected static function newFactory(): ErpJournalFactory
    {
        return ErpJournalFactory::new();
    }
}
