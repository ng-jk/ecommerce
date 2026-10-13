<?php

namespace App\Models;

use Database\Factories\OrganizationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Organization extends Model
{
    /** @use HasFactory<OrganizationFactory> */
    use HasFactory, SoftDeletes;

    public const Active = 'active';

    public const Suspended = 'suspended';

    protected $fillable = ['code', 'name', 'status', 'version'];

    protected $hidden = ['deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['status' => self::Active, 'version' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Active => 'Active', self::Suspended => 'Suspended'];
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(OrganizationMembership::class);
    }

    public function applications(): HasMany
    {
        return $this->hasMany(OrganizationApplication::class);
    }
}
