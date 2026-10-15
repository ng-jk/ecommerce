<?php

namespace Tests\Feature;

use App\Models\PlatformUser;
use App\Models\Shop;
use App\Models\User;
use App\Modules\Platform\PlatformAuthActions;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PDOException;
use Tests\TestCase;

class PlatformIdentityFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_global_platform_registration_does_not_claim_equal_shop_account(): void
    {
        $shop = Shop::create(['slug' => 'identity-shop', 'name' => 'Identity Shop']);
        User::factory()->create(['shop_id' => $shop->id, 'email' => 'person@example.com']);
        $result = app(PlatformAuthActions::class)->register($this->request([
            'name' => 'Platform Person', 'email' => ' PERSON@example.com ', 'password' => 'secure-password-123',
            'password_confirmation' => 'secure-password-123', 'device_name' => 'test-device',
        ]));

        $this->assertSame('person@example.com', $result['user']['email']);
        $this->assertSame(0, $result['auth_version']);
        $this->assertStringContainsString('|', $result['token']);
        $this->assertSame(1, PlatformUser::count());
        $this->assertSame(1, User::count());
        $this->assertSame(['platform'], PlatformUser::firstOrFail()->tokens()->firstOrFail()->abilities);
        $this->assertArrayNotHasKey('password', $result['user']);
        $this->assertArrayNotHasKey('auth_version', $result['user']);
        $this->assertArrayNotHasKey('token', app(PlatformAuthActions::class)->me(PlatformUser::firstOrFail())['user']);
    }

    public function test_login_normalizes_email_and_keeps_invalid_account_errors_identical(): void
    {
        $actions = app(PlatformAuthActions::class);
        $user = PlatformUser::factory()->create(['email' => 'person@example.com']);
        $result = $actions->login($this->request(['email' => ' PERSON@example.com ', 'password' => 'test-password-123', 'device_name' => 'device']));
        $this->assertSame($user->id, $result['user']['id']);

        foreach ([
            ['email' => 'missing@example.com', 'password' => 'test-password-123', 'device_name' => 'device'],
            ['email' => 'person@example.com', 'password' => 'wrong-password', 'device_name' => 'device'],
        ] as $input) {
            $this->assertCredentialError($actions, $input);
        }
        $user->update(['account_status' => PlatformUser::Disabled]);
        $this->assertCredentialError($actions, ['email' => 'person@example.com', 'password' => 'test-password-123', 'device_name' => 'device']);
    }

    public function test_logout_revokes_tokens_and_changes_auth_version(): void
    {
        $user = PlatformUser::factory()->create();
        $actions = app(PlatformAuthActions::class);
        for ($index = 0; $index < 2; $index++) {
            $actions->login($this->request(['email' => $user->email, 'password' => 'test-password-123', 'device_name' => 'device-'.$index]));
        }
        $this->assertSame(2, $user->tokens()->count());
        $this->assertSame(['logged_out' => true], $actions->logout($user));
        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(1, $user->fresh()->auth_version);
    }

    public function test_reserved_email_and_unexpected_fields_are_rejected(): void
    {
        $user = PlatformUser::factory()->create(['email' => 'person@example.com']);
        $user->delete();
        $actions = app(PlatformAuthActions::class);
        foreach ([
            ['name' => 'Second', 'email' => ' PERSON@example.com ', 'password' => 'secure-password-123', 'password_confirmation' => 'secure-password-123', 'device_name' => 'device'],
            ['name' => 'Second', 'email' => 'second@example.com', 'password' => 'secure-password-123', 'password_confirmation' => 'secure-password-123', 'device_name' => 'device', 'shop_id' => 1],
        ] as $input) {
            try {
                $actions->register($this->request($input));
                $this->fail('The request must be rejected.');
            } catch (ValidationException $error) {
                $this->assertNotEmpty($error->errors());
            }
        }
        $this->assertSame(0, PlatformUser::count());
    }

    public function test_database_reserves_global_email_and_hides_internal_fields(): void
    {
        $user = PlatformUser::factory()->create(['email' => 'person@example.com']);
        $this->assertSame(['active' => 'Active', 'disabled' => 'Disabled'], PlatformUser::options());
        $this->assertArrayNotHasKey('password', $user->toArray());
        $this->assertArrayNotHasKey('auth_version', $user->toArray());
        try {
            DB::transaction(fn () => DB::table('platform_users')->insert(['name' => 'Duplicate', 'email' => 'person@example.com', 'password' => 'hash', 'created_at' => now(), 'updated_at' => now()]));
            $this->fail('Global email uniqueness must be enforced by the database.');
        } catch (QueryException $error) {
            $this->assertContains((string) $error->getCode(), ['23505', '23000', '19']);
        }
        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::transaction(fn () => DB::table('platform_users')->insert(['name' => 'Mixed', 'email' => 'Mixed@example.com', 'password' => 'hash', 'created_at' => now(), 'updated_at' => now()]));
                $this->fail('Raw writes must preserve the email policy.');
            } catch (QueryException $error) {
                $this->assertSame('23514', (string) $error->getCode());
            }
        }
    }

    public function test_registration_database_race_maps_unique_email_and_rethrows_unrelated_errors(): void
    {
        $actions = app(PlatformAuthActions::class);
        $input = ['name' => 'Racing User', 'email' => 'race@example.com', 'password' => 'secure-password-123',
            'password_confirmation' => 'secure-password-123', 'device_name' => 'device'];
        PlatformUser::creating(function (PlatformUser $user): void {
            if ($user->email === 'race@example.com') {
                DB::table('platform_users')->insert(['name' => 'Winner', 'email' => 'race@example.com',
                    'password' => 'hash', 'created_at' => now(), 'updated_at' => now()]);
            }
        });
        try {
            $actions->register($this->request($input));
            $this->fail('Concurrent duplicate should be rejected.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('email', $error->errors());
        } finally {
            PlatformUser::flushEventListeners();
        }
        DB::table('platform_users')->where('email', 'race@example.com')->delete();
        PlatformUser::creating(function (PlatformUser $user): void {
            if ($user->email === 'race@example.com') {
                throw new QueryException('sqlite', 'insert', [], new PDOException('Other failure', 999));
            }
        });
        try {
            $this->expectException(QueryException::class);
            $actions->register($this->request($input));
        } finally {
            PlatformUser::flushEventListeners();
        }
    }

    private function assertCredentialError(PlatformAuthActions $actions, array $input): void
    {
        try {
            $actions->login($this->request($input));
            $this->fail('Invalid credentials must be rejected.');
        } catch (ValidationException $error) {
            $this->assertSame(['email' => ['The provided credentials are incorrect.']], $error->errors());
        }
    }

    private function request(array $input): Request
    {
        return Request::create('/', 'POST', $input);
    }
}
