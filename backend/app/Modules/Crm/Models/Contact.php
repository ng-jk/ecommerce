<?php

namespace App\Modules\Crm\Models;

use Database\Factories\CrmContactFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contact extends Model
{
    /** @use HasFactory<CrmContactFactory> */
    use HasFactory, SoftDeletes;

    protected $table = 'crm_contacts';

    protected $fillable = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'company_id', 'name', 'email', 'version'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['version' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    protected static function newFactory(): CrmContactFactory
    {
        return CrmContactFactory::new();
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
