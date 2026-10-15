<?php

namespace App\Modules\Erp\Models;

use Database\Factories\ErpJournalLineFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class JournalLine extends Model
{
    /** @use HasFactory<ErpJournalLineFactory> */
    use HasFactory, SoftDeletes;

    protected $table = 'erp_journal_lines';

    protected $fillable = ['organization_id', 'journal_id', 'account_id', 'position', 'debit_minor', 'credit_minor'];

    protected $hidden = ['organization_id', 'created_at', 'updated_at', 'deleted_at'];

    protected function casts(): array
    {
        return ['position' => 'integer', 'debit_minor' => 'integer', 'credit_minor' => 'integer'];
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }

    protected static function newFactory(): ErpJournalLineFactory
    {
        return ErpJournalLineFactory::new();
    }
}
