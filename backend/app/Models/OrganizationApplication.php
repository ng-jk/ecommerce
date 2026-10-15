<?php

namespace App\Models;

use Database\Factories\OrganizationApplicationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class OrganizationApplication extends Model
{
    /** @use HasFactory<OrganizationApplicationFactory> */
    use HasFactory, SoftDeletes;

    public const Installed = 'installed';

    public const Disabled = 'disabled';

    public const Revoked = 'revoked';

    protected $fillable = ['organization_id', 'application_key', 'state', 'version'];

    protected $hidden = ['organization_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['state' => self::Disabled, 'version' => 0];

    protected function casts(): array
    {
        return ['version' => 'integer'];
    }

    public static function options(): array
    {
        return [self::Installed => 'Installed', self::Disabled => 'Disabled', self::Revoked => 'Revoked'];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
