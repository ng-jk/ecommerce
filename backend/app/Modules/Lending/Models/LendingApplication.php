<?php

namespace App\Modules\Lending\Models;

use Database\Factories\Modules\Lending\Models\LendingApplicationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LendingApplication extends Model
{
    public const Draft = 'draft';

    public const Submitted = 'submitted';

    public const Approved = 'approved';

    public const Rejected = 'rejected';

    public const Withdrawn = 'withdrawn';

    /** @use HasFactory<LendingApplicationFactory> */
    use HasFactory, SoftDeletes;

    protected $guarded = ['id'];

    protected $hidden = ['organization_id', 'created_at', 'updated_at', 'deleted_at'];

    protected $attributes = ['status' => self::Draft, 'version' => 0];

    protected static function newFactory(): LendingApplicationFactory
    {
        return LendingApplicationFactory::new();
    }

    protected function casts(): array
    {
        return ['version' => 'integer', 'principal_minor' => 'integer', 'terms_snapshot' => 'array', 'purpose' => 'encrypted', 'decision_note' => 'encrypted', 'submitted_at' => 'datetime', 'decided_at' => 'datetime', 'withdrawn_at' => 'datetime'];
    }

    public static function options(): array
    {
        return [self::Draft => 'Draft', self::Submitted => 'Submitted', self::Approved => 'Approved', self::Rejected => 'Rejected', self::Withdrawn => 'Withdrawn'];
    }
}
