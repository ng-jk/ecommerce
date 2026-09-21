<?php

namespace App\Http\Controllers;

use App\Models\Shop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function register(Request $request, Shop $shop): array
    {
        $request->merge(['email' => strtolower(trim((string) $request->input('email')))]);
        $data = $request->validate([
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
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string', 'device_name' => 'nullable|string|max:100']);
        $user = User::where('shop_id', $shop->id)->where('email', strtolower(trim($data['email'])))->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'The provided credentials are incorrect.']);
        }

        return $this->authenticate($request, $user);
    }

    private function authenticate(Request $request, User $user): array
    {
        if ($request->filled('device_name')) {
            return ['user' => $user, 'token' => $user->createToken($request->string('device_name')->toString(), ['*'], now()->addDays(7))->plainTextToken];
        }
        abort_unless($request->hasSession(), 422, 'Browser session required. Native clients must supply device_name.');
        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return ['user' => $user];
    }

    public function me(Request $request, Shop $shop): array
    {
        return ['user' => $request->user()];
    }

    public function logout(Request $request, Shop $shop): Response
    {
        $token = $request->user()->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        } elseif ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }
}
