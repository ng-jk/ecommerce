<?php

namespace App\Models;

use Database\Factories\OrganizationMembershipFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class OrganizationMembership extends Model
{
    /** @use HasFactory<OrganizationMembershipFactory> */
    use HasFactory, SoftDeletes;

    public const Member = 'member';

    public const Admin = 'admin';

    public const Owner = 'owner';

    public const Active = 'active';

    public const Invited = 'invited';

    public const Revoked = 'revoked';

    protected $fillable = ['organization_id', 'user_id', 'role', 'status'];

    protected $hidden = ['organization_id', 'user_id', 'deleted_at', 'created_at', 'updated_at'];

    protected $attributes = ['role' => self::Member, 'status' => self::Invited];

    public static function options(string $field = 'role'): array
    {
        return match ($field) {
            'role' => [self::Member => 'Member', self::Admin => 'Administrator', self::Owner => 'Owner'],
            'status' => [self::Active => 'Active', self::Invited => 'Invited', self::Revoked => 'Revoked'],
            default => [],
        };
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
