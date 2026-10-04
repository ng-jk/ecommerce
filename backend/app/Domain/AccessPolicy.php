<?php

namespace App\Domain;

use App\Models\Shop;
use App\Models\User;

class AccessPolicy
{
    public function roles(string $action): array
    {
        $rule = config('commerce.actions', [])[$action] ?? [];
        if (($rule['enabled'] ?? false) !== true || ! is_array($rule['roles'] ?? null)) {
            return [];
        }

        $maximum = str_starts_with($action, 'admin.') ? [User::Admin] : [User::Customer, User::Admin];
        if (in_array($action, ['catalog', 'product', 'auth.login', 'auth.register'], true)) {
            array_unshift($maximum, 'guest');
        }

        return array_values(array_intersect($rule['roles'], $maximum));
    }

    public function allows(string $action, ?User $user): bool
    {
        return (! $user || $user->account_status === 'active') && in_array($user?->role ?? 'guest', $this->roles($action), true);
    }

    public function enforce(string $action, ?User $user): void
    {
        abort_unless($this->allows($action, $user), 403, 'This action is disabled or unavailable for your role.');
    }

    public function allowsInShop(string $action, ?User $user, Shop $shop): bool
    {
        return $this->allows($action, $user) && BundledPlugins::allows($shop, $user, $action);
    }

    public function enforceInShop(string $action, ?User $user, Shop $shop): void
    {
        abort_unless($this->allowsInShop($action, $user, $shop), 403, 'This action is disabled or unavailable for your role.');
    }
}
