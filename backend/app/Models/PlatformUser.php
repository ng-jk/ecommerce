<?php

namespace App\Models;

use Database\Factories\PlatformUserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'account_status'])]
#[Hidden(['password', 'remember_token', 'auth_version', 'deleted_at'])]
class PlatformUser extends Authenticatable
{
    /** @use HasFactory<PlatformUserFactory> */
    use HasApiTokens, HasFactory, SoftDeletes;

    public const Active = 'active';

    public const Disabled = 'disabled';

    protected $attributes = ['account_status' => self::Active, 'auth_version' => 0];

    public static function options(): array
    {
        return [self::Active => 'Active', self::Disabled => 'Disabled'];
    }

    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => strtolower(trim($value)));
    }

    protected function casts(): array
    {
        return ['password' => 'hashed', 'auth_version' => 'integer'];
    }
}
