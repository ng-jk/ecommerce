<?php

namespace App\Modules\Platform;

use App\Models\PlatformUser;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class PlatformAuthActions
{
    private const MissingPasswordHash = '$2y$12$ybG2ESHUzBzbP/Kf2XgND.Q3Ays8dbA72vWZWr3QpExEbGgY869xa';

    public function register(Request $request): array
    {
        $input = $this->validated($request, [
            'name' => 'required|string|max:100',
            'email' => ['required', 'email', 'max:255', Rule::unique('platform_users', 'email')],
            'password' => ['required', 'confirmed', Password::min(10)],
            'password_confirmation' => 'required|string',
            'device_name' => 'required|string|max:100',
        ]);

        try {
            return DB::transaction(function () use ($input): array {
                $user = PlatformUser::create(['name' => trim($input['name']), 'email' => $input['email'], 'password' => $input['password']]);

                return $this->authenticate($user, $input['device_name']);
            });
        } catch (QueryException $error) {
            if (in_array($error->getCode(), ['23505', '23000', '19'], true)) {
                throw ValidationException::withMessages(['email' => 'The email address is already in use.']);
            }

            throw $error;
        }

    }

    public function login(Request $request): array
    {
        $input = $this->validated($request, [
            'email' => 'required|email|max:255',
            'password' => 'required|string',
            'device_name' => 'required|string|max:100',
        ]);
        $user = PlatformUser::query()->where('email', $input['email'])->lockForUpdate()->first();
        $passwordMatches = Hash::check($input['password'], $user?->password ?? self::MissingPasswordHash);
        if (! $user || $user->account_status !== PlatformUser::Active || ! $passwordMatches) {
            throw ValidationException::withMessages(['email' => 'The provided credentials are incorrect.']);
        }

        return $this->authenticate($user, $input['device_name']);
    }

    public function logout(PlatformUser $user): array
    {
        $user->increment('auth_version');
        $user->tokens()->delete();

        return ['logged_out' => true];
    }

    public function me(PlatformUser $user): array
    {
        return ['user' => $this->publicUser($user)];
    }

    private function authenticate(PlatformUser $user, string $deviceName): array
    {
        return [
            'auth_version' => $user->auth_version,
            'user' => $this->publicUser($user),
            'token' => $user->createToken($deviceName, ['platform'], now()->addDays(7))->plainTextToken,
        ];
    }

    private function publicUser(PlatformUser $user): array
    {
        return ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'account_status' => $user->account_status];
    }

    private function validated(Request $request, array $rules): array
    {
        $input = $request->all();
        foreach (array_diff(array_keys($input), array_keys($rules)) as $field) {
            throw ValidationException::withMessages([$field => 'The field is not supported.']);
        }
        if (isset($input['email']) && is_string($input['email'])) {
            $input['email'] = strtolower(trim($input['email']));
        }

        return Validator::make($input, $rules)->validate();
    }
}
