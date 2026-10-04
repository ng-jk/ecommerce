<?php

namespace App\Domain\Assistant;

use App\Domain\AccessPolicy;
use App\Models\Order;
use App\Models\PluginInstallation;
use App\Models\Shop;
use App\Models\User;

class ToolRegistry
{
    public function all(): array
    {
        $tools = json_decode(file_get_contents(resource_path('assistant-tools.json')), true, flags: JSON_THROW_ON_ERROR);
        foreach ($tools as &$tool) {
            foreach (['expected_version', 'checkout_key'] as $field) {
                unset($tool['parameters']['properties'][$field]);
                $tool['parameters']['required'] = array_values(array_diff($tool['parameters']['required'], [$field]));
            }
            if (isset($tool['parameters']['properties']['status'])) {
                $tool['parameters']['properties']['status']['enum'] = array_keys(Order::options());
                $tool['parameters']['properties']['status']['options'] = Order::options();
            }
            if ($tool['action'] === 'cart.update') {
                $tool['description'] = 'Add a product to my cart by product name and quantity, or replace the complete cart using items.';
                $tool['parameters']['properties'] += ['product_query' => ['type' => 'string', 'maxLength' => 100], 'product_id' => ['type' => 'integer', 'minimum' => 1], 'quantity' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 99]];
                $tool['parameters']['required'] = [];
            }
        }

        return $tools;
    }

    public function available(?User $user, ?Shop $shop = null): array
    {
        return array_values(array_filter($this->all(), fn (array $tool): bool => $tool['callable'] && ($shop ? app(AccessPolicy::class)->allowsInShop($tool['action'], $user, $shop) : (app(AccessPolicy::class)->allows($tool['action'], $user) && ! str_starts_with($tool['action'], 'plugin.') && ! str_starts_with($tool['action'], 'admin.plugin.loyalty.'))) && ($tool['role'] === 'public' || ($user && ($tool['role'] === 'user' || $user->role === User::Admin)))));
    }

    public function find(string $name, ?User $user, ?Shop $shop = null): array
    {
        foreach ($this->available($user, $shop) as $tool) {
            if ($tool['name'] === $name) {
                return $tool;
            }
        }
        abort(403, 'This action is not available.');
    }

    public function describe(array $tool, string $shop, ?Shop $tenant = null): array
    {
        $roles = app(AccessPolicy::class)->roles($tool['action']);
        if ($tenant && $tool['action'] === 'plugin.loyalty.balance') {
            $customerEnabled = PluginInstallation::where('shop_id', $tenant->id)->where('plugin_id', PluginInstallation::Loyalty)->where('enabled', true)->where('customer_enabled', true)->exists();
            if (! $customerEnabled) {
                $roles = array_values(array_diff($roles, [User::Customer]));
            }
        }

        return ['name' => $tool['name'], 'method' => $tool['method'], 'path' => str_replace('{shop}', $shop, $tool['path']), 'description' => $tool['description'], 'parameters' => $tool['parameters'], 'confirmation_required' => $tool['confirmation'], 'natural_language_confirmation_required' => true, 'allowed_roles' => $roles];
    }
}
