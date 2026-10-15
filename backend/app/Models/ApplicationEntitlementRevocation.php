<?php

namespace App\Models;

use Database\Factories\ApplicationEntitlementRevocationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApplicationEntitlementRevocation extends Model
{
    /** @use HasFactory<ApplicationEntitlementRevocationFactory> */
    use HasFactory, SoftDeletes;

    protected $fillable = ['grant_id', 'reason', 'evidence_ref', 'revoked_at'];

    protected $hidden = ['evidence_ref', 'deleted_at', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['revoked_at' => 'datetime'];
    }

    public function grant(): BelongsTo
    {
        return $this->belongsTo(ApplicationEntitlementGrant::class, 'grant_id');
    }
}
