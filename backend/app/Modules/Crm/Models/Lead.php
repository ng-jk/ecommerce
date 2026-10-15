<?php

namespace App\Modules\Crm\Models;

use Database\Factories\CrmLeadFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lead extends Model
{
    /** @use HasFactory<CrmLeadFactory> */
    use HasFactory, SoftDeletes;

    public const New = 'new';

    public const Contacted = 'contacted';

    public const Qualified = 'qualified';

    public const Converted = 'converted';

    public const Lost = 'lost';

    protected $table = 'crm_leads';

    protected $fillable = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'company_id', 'contact_id', 'name', 'email', 'status', 'version'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::New, 'version' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    protected static function newFactory(): CrmLeadFactory
    {
        return CrmLeadFactory::new();
    }

    public static function options(): array
    {
        return [self::New => 'New', self::Contacted => 'Contacted', self::Qualified => 'Qualified',
            self::Converted => 'Converted', self::Lost => 'Lost'];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }
}
