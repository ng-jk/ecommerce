<?php

namespace App\Domain;

use App\Domain\Assistant\AssistantActions;
use App\Models\Operation;
use App\Models\Order;
use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use App\Plugins\Loyalty\LoyaltyPlugin;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class ActionExecutor
{
    public function execute(Operation $op): array
    {
        $shop = Shop::findOrFail($op->shop_id);
        $user = $op->user_id ? User::lockForUpdate()->find($op->user_id) : null;
        if ($op->user_id) {
            abort_unless($user && $user->shop_id === $shop->id && $user->account_status === 'active' && $user->auth_version === $op->auth_version, 403, 'Account access changed.');
            if ($op->token_id) {
                $token = PersonalAccessToken::find($op->token_id);
                abort_unless($token && $token->tokenable_id === $user->id && (! $token->expires_at || $token->expires_at->isFuture()), 401);
            }
        }
        if (str_starts_with($op->action, 'admin.')) {
            abort_unless($user?->role === User::Admin, 403);
        }
        abort_if(in_array($op->action, ['auth.me', 'auth.logout', 'cart.read', 'cart.update', 'checkout', 'orders'], true) && ! $user, 401);
        if ($op->action !== 'assistant') {
            if (! array_key_exists($op->action, config('commerce.actions', []))) {
                throw ValidationException::withMessages(['action' => 'Unknown command.']);
            }
            app(AccessPolicy::class)->enforceInShop($op->action, $user, $shop);
        }
        $op->state_before = $this->state($user);
        $input = $op->payload['input'];
        if (in_array($op->action, ['cart.update', 'checkout', 'admin.update', 'admin.delete', 'admin.advance'], true)) {
            $rules = ['expected_version' => 'required|integer:strict|min:0'];
            if ($op->action === 'checkout') {
                $rules['checkout_key'] = 'required|uuid';
            }
            $versionData = Validator::make($input, $rules)->validate();
            $target = $user;
            if (in_array($op->action, ['admin.update', 'admin.delete'], true)) {
                $target = Product::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($op->payload['id']);
            }
            if ($op->action === 'admin.advance') {
                $target = Order::where('shop_id', $shop->id)->lockForUpdate()->findOrFail($op->payload['id']);
            }
            $replay = $op->action === 'checkout' && Order::where('user_id', $user->id)->where('checkout_key', $input['checkout_key'] ?? '')->exists();
            abort_unless($replay || (int) $target->version === (int) $versionData['expected_version'], 409, 'The record changed. Refresh before retrying.');
        }

        $request = Request::create('/', 'POST', $input);
        $request->setUserResolver(fn () => $user);
        Auth::forgetGuards();
        if ($user) {
            Auth::guard()->setUser($user);
        }
        $store = app(StoreActions::class);
        $admin = app(AdminActions::class);
        $plugins = app(PluginActions::class);
        $loyalty = app(LoyaltyPlugin::class);
        $id = (int) ($op->payload['id'] ?? 0);
        $result = match ($op->action) {
            'auth.login' => app(AuthActions::class)->login($request, $shop),
            'auth.register' => app(AuthActions::class)->register($request, $shop),
            'auth.logout' => app(AuthActions::class)->logout($request, $shop),
            'auth.me' => ['user' => $user],
            'assistant' => app(AssistantActions::class)->run($op, $shop, $user),
            'catalog' => $store->products($request, $shop),
            'product' => $store->product($shop, $id),
            'cart.read' => $store->cart($request, $shop),
            'cart.update' => $store->updateCart($request, $shop),
            'checkout' => $store->checkout($request, $shop),
            'orders' => $store->orders($request, $shop),
            'admin.products' => $admin->products($request, $shop),
            'admin.product' => $admin->product($request, $shop, $id),
            'admin.create' => $admin->createProduct($request, $shop),
            'admin.update' => $admin->updateProduct($request, $shop, $id),
            'admin.delete' => $admin->deleteProduct($request, $shop, $id),
            'admin.orders' => $admin->orders($request, $shop),
            'admin.advance' => $admin->updateOrder($request, $shop, $id),
            'admin.plugins' => $plugins->listing($request, $shop),
            'admin.plugin' => $plugins->detail($shop, $id),
            'admin.plugin.install' => $plugins->install($request, $shop),
            'admin.plugin.update' => $plugins->update($request, $shop, $id),
            'plugin.loyalty.balance' => $loyalty->balance($request, $shop),
            'admin.plugin.loyalty.credit' => $loyalty->credit($request, $shop, $op),
            default => throw ValidationException::withMessages(['action' => 'Unknown command.']),
        };
        $actor = $op->action === 'auth.logout' ? null : ($result['user'] ?? $user?->fresh());
        $op->state_after = [...$this->state($actor), 'action' => $op->action];

        return json_decode(json_encode($result, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
    }

    private function state(?User $user): array
    {
        return $user ? ['account' => $user->account_status, 'cart' => empty($user->cart) ? 'empty' : 'active', 'version' => $user->version] : ['account' => 'guest'];
    }
}
