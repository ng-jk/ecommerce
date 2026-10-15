<?php

namespace App\Models;

use Database\Factories\ApplicationEntitlementGrantFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApplicationEntitlementGrant extends Model
{
    /** @use HasFactory<ApplicationEntitlementGrantFactory> */
    use HasFactory, SoftDeletes;

    public const Free = 'free';

    public const Trial = 'trial';

    public const VerifiedSettlement = 'verified_settlement';

    public const Operator = 'operator';

    protected $fillable = ['organization_id', 'application_key', 'source', 'evidence_ref', 'starts_at', 'expires_at', 'evidence'];

    protected $hidden = ['evidence', 'evidence_ref', 'deleted_at', 'created_at', 'updated_at'];

    public static function options(): array
    {
        return [self::Free => 'Free', self::Trial => 'Trial',
            self::VerifiedSettlement => 'Verified settlement', self::Operator => 'Operator grant'];
    }

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'expires_at' => 'datetime', 'evidence' => 'array'];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function revocation(): HasOne
    {
        return $this->hasOne(ApplicationEntitlementRevocation::class, 'grant_id');
    }

    public function scopeActiveAt(Builder $query, ?\DateTimeInterface $at = null): Builder
    {
        $time = $at ?? now();

        return $query->where('starts_at', '<=', $time)
            ->where(fn (Builder $query): Builder => $query->whereNull('expires_at')->orWhere('expires_at', '>', $time))
            ->whereDoesntHave('revocation');
    }

    public static function activeFor(int $organizationId, string $applicationKey): Builder
    {
        return static::query()->where('organization_id', $organizationId)
            ->where('application_key', $applicationKey)->activeAt();
    }
}
