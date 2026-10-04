<?php

namespace App\Plugins\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyBalance;
use App\Models\LoyaltyCredit;
use App\Models\Operation;
use App\Models\PluginInstallation;
use App\Models\Shop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class LoyaltyPlugin extends Controller
{
    private function enabled(Shop $shop, ?User $user, bool $customerAction): PluginInstallation
    {
        $plugin = PluginInstallation::where('shop_id', $shop->id)->where('plugin_id', PluginInstallation::Loyalty)->lockForUpdate()->first();
        abort_unless($plugin && $plugin->enabled && (! $customerAction || $user?->role === User::Admin || $plugin->customer_enabled), 403, 'This plugin is disabled for your role.');

        return $plugin;
    }

    public function isAvailable(Shop $shop, ?User $user, string $action): bool
    {
        $plugin = PluginInstallation::where('shop_id', $shop->id)->where('plugin_id', PluginInstallation::Loyalty)->first();

        return (bool) ($plugin?->enabled && ($action !== 'plugin.loyalty.balance' || $user?->role === User::Admin || $plugin->customer_enabled));
    }

    public function balance(Request $request, Shop $shop): array
    {
        if ($request->all() !== []) {
            throw ValidationException::withMessages([array_key_first($request->all()) => 'Unknown field.']);
        }
        $this->enabled($shop, $request->user(), true);
        $points = LoyaltyBalance::where('shop_id', $shop->id)->where('user_id', $request->user()->id)->value('points') ?? 0;

        return ['balance' => ['points' => (int) $points]];
    }

    public function credit(Request $request, Shop $shop, Operation $operation): array
    {
        $extra = array_diff(array_keys($request->all()), ['user_id', 'points', 'reason']);
        if ($extra) {
            throw ValidationException::withMessages([reset($extra) => 'Unknown field.']);
        }
        $data = $this->validate($request, ['user_id' => 'required|integer:strict|min:1', 'points' => 'required|integer:strict|min:1|max:10000', 'reason' => 'required|string|min:1|max:200']);
        $recipient = User::where('shop_id', $shop->id)->where('role', User::Customer)->where('account_status', 'active')->lockForUpdate()->findOrFail($data['user_id']);
        $plugin = $this->enabled($shop, $request->user(), false);
        if ($data['points'] > $plugin->max_credit) {
            throw ValidationException::withMessages(['points' => 'Credit exceeds this shop’s configured limit.']);
        }
        $balance = LoyaltyBalance::where('shop_id', $shop->id)->where('user_id', $recipient->id)->lockForUpdate()->first();
        if (! $balance) {
            $balance = LoyaltyBalance::create(['shop_id' => $shop->id, 'user_id' => $recipient->id, 'points' => 0]);
        }
        if ($balance->points > 2147483647 - $data['points']) {
            throw ValidationException::withMessages(['points' => 'The balance limit would be exceeded.']);
        }
        $balance->increment('points', $data['points']);
        LoyaltyCredit::create(['shop_id' => $shop->id, 'user_id' => $recipient->id, 'operation_id' => $operation->id, 'points' => $data['points'], 'reason' => $data['reason']]);

        return ['balance' => ['points' => $balance->refresh()->points]];
    }
}
