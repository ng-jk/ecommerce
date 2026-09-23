<?php

namespace App\Domain;

use App\Http\Controllers\Controller;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthActions extends Controller
{
    public function register(Request $request, Shop $shop): array
    {
        Shop::whereKey($shop->id)->lockForUpdate()->firstOrFail();
        $request->merge(['email' => strtolower(trim((string) $request->input('email')))]);
        $data = $this->validate($request, [
            'name' => 'required|string|max:100',
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->where('shop_id', $shop->id)],
            'password' => ['required', 'confirmed', Password::min(10)],
            'device_name' => 'nullable|string|max:100',
        ]);
        $user = User::create(['shop_id' => $shop->id, 'name' => $data['name'], 'email' => $data['email'], 'password' => $data['password'], 'role' => 'customer']);

        return $this->authenticate($request, $user);
    }

    public function login(Request $request, Shop $shop): array
    {
        $data = $this->validate($request, ['email' => 'required|email', 'password' => 'required|string', 'device_name' => 'nullable|string|max:100']);
        $user = User::where('shop_id', $shop->id)->where('email', strtolower(trim($data['email'])))->lockForUpdate()->first();
        if (! $user || $user->account_status !== 'active' || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'The provided credentials are incorrect.']);
        }

        return $this->authenticate($request, $user);
    }

    private function authenticate(Request $request, User $user): array
    {
        if ($request->filled('device_name')) {
            return ['auth_version' => $user->auth_version, 'user' => $user, 'token' => $user->createToken($request->string('device_name')->toString(), ['*'], now()->addDays(7))->plainTextToken];
        }

        return ['auth_version' => $user->auth_version, 'user' => $user];
    }

    public function logout(Request $request, Shop $shop): array
    {
        $request->user()->increment('auth_version');
        $request->user()->tokens()->delete();

        return ['logged_out' => true];
    }
}
