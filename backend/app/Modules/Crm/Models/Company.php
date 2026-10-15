<?php

namespace App\Modules\Crm\Models;

use Database\Factories\CrmCompanyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Company extends Model
{
    /** @use HasFactory<CrmCompanyFactory> */
    use HasFactory, SoftDeletes;

    protected $table = 'crm_companies';

    protected $fillable = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id', 'code', 'name', 'version'];

    protected $hidden = ['organization_id', 'created_by_platform_user_id', 'updated_by_platform_user_id',
        'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['version' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    protected static function newFactory(): CrmCompanyFactory
    {
        return CrmCompanyFactory::new();
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }
}
