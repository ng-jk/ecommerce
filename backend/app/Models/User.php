<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['shop_id', 'name', 'email', 'password', 'role', 'cart'])]
#[Hidden(['password', 'remember_token', 'cart', 'auth_version', 'deleted_at'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, \Illuminate\Database\Eloquent\SoftDeletes, Notifiable;

    protected $attributes = ['role' => self::Customer, 'account_status' => 'active', 'version' => 0, 'auth_version' => 0];

    public const Customer = 'customer';

    public const Admin = 'admin';

    public static function options(): array
    {
        return [self::Customer => 'Customer', self::Admin => 'Administrator'];
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'cart' => 'array',
            'version' => 'integer',
            'auth_version' => 'integer',
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
